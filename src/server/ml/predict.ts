import fs from 'fs';
import path from 'path';
import { db } from '../db.js';
import { trainModel, getHaversineDistance } from './train.js';

interface ModelWeights {
  coefficients: number[];
  intercept: number;
  featureNames: string[];
  means: number[];
  stds: number[];
  mae: number;
  rmse: number;
  r2: number;
  timestamp: string;
}

const MODEL_DIR_PATH = path.resolve(process.cwd(), 'src/server/ml/models');
const MODEL_FILE_PATH = path.join(MODEL_DIR_PATH, 'eta_model.json');

let cachedModel: ModelWeights | null = null;

// Load or Train Model dynamically on demand
function getModel(): ModelWeights | null {
  if (cachedModel) return cachedModel;

  if (fs.existsSync(MODEL_FILE_PATH)) {
    try {
      const fileContent = fs.readFileSync(MODEL_FILE_PATH, 'utf-8');
      cachedModel = JSON.parse(fileContent);
      return cachedModel;
    } catch (err) {
      console.error('Failed to parse model file. Retraining...', err);
    }
  }

  // If file doesn't exist, train it now
  try {
    cachedModel = trainModel();
    return cachedModel;
  } catch (err) {
    console.error('ML MODEL: Automatic training failed, falling back to heuristic math.', err);
    return null;
  }
}

export interface PredictionResult {
  predicted_eta_minutes: number;
  arrival_time_iso: string;
  confidence_score: number;
  model_used: string;
  features: {
    distance_km: number;
    current_speed_kmh: number;
    rolling_avg_speed: number;
    traffic_delay_minutes: number;
  };
}

/**
 * Predicts the ETA for a bus to arrive at a specific stop.
 */
export function predictEta(busId: string, stopId: string): PredictionResult {
  const bus = db.getBus(busId);
  const stop = db.getStops().find(s => s.id === stopId);

  if (!bus || !stop) {
    throw new Error(`Bus ${busId} or Stop ${stopId} not found`);
  }

  // 1. Feature: Distance to Stop via Haversine calculation
  const distanceKm = getHaversineDistance(bus.current_lat, bus.current_lng, stop.lat, stop.lng);

  // 2. Feature: Current Speed
  const latestPing = db.getLatestPing(busId);
  const currentSpeed = latestPing ? latestPing.speed_kmh : 35; // Default 35km/h for stop/starts

  // 3. Feature: Time of Day decimal (e.g. 14:15 -> 14.25)
  const now = new Date();
  const timeOfDay = now.getHours() + now.getMinutes() / 60;

  // 4. Feature: Day of Week
  const dayOfWeek = now.getDay(); // 0 is Sunday, ..., 6 is Saturday

  // 5. Feature: Stop sequence number
  const stopSeqNum = stop.sequence_order;

  // 6. Feature: Rolling speed last 5 pings
  const pings = db.getBusPingHistory(busId, 5);
  let rollingAvgSpeed = currentSpeed;
  if (pings.length > 0) {
    const sum = pings.reduce((acc, p) => acc + p.speed_kmh, 0);
    rollingAvgSpeed = sum / pings.length;
  }

  // 7. Feature: Scheduled Delay
  let scheduledDelayMinutes = 0;
  const schedules = db.getSchedules().filter(s => s.bus_id === busId && s.route_id === stop.route_id);
  if (schedules.length > 0) {
    // Find closest schedule
    const firstSchedule = schedules[0];
    const [schedHour, schedMin] = firstSchedule.departure_time.split(':').map(Number);
    const schedMinutes = schedHour * 60 + schedMin;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // If current time is after scheduled departure, calculate delay
    if (currentMinutes > schedMinutes) {
      // Assuming a trip takes up to 120 minutes, if we are in that window, calculate delay
      scheduledDelayMinutes = currentMinutes - schedMinutes;
      // Cap plausible delay at 120m before assuming next day's runs
      if (scheduledDelayMinutes > 120) {
        scheduledDelayMinutes = 0;
      }
    }
  }

  // Load ML Model
  const model = getModel();

  if (model) {
    try {
      const featureValues = [
        distanceKm,
        currentSpeed,
        timeOfDay,
        dayOfWeek,
        stopSeqNum,
        rollingAvgSpeed,
        scheduledDelayMinutes
      ];

      // Standardise features using model's trained means and stds
      const stdFeatures = featureValues.map((val, i) => {
        const mean = model.means[i];
        const std = model.stds[i];
        return (val - mean) / std;
      });

      // Predict target variable (travel time in minutes)
      let predictedEta = model.intercept;
      for (let i = 0; i < stdFeatures.length; i++) {
        predictedEta += model.coefficients[i] * stdFeatures[i];
      }

      // Safeguard: make sure prediction is realistic (can't be faster than 80km/h on rural roads, or instant)
      const minPossibleTime = (distanceKm / 80) * 60; // 80km/h speed cap
      predictedEta = Math.max(minPossibleTime, predictedEta);
      
      // If the speed is exactly 0 and distance is small (arrived), make it extremely close to zero
      if (currentSpeed === 0 && distanceKm < 0.05) {
        predictedEta = 0;
      } else if (predictedEta < 0.5) {
        predictedEta = 0.5; // at least 30s
      }

      // Calculate confidence score (Base R2 adjusted by ping freshness and speed variance)
      let baseConfidence = model.r2; // e.g. 0.85
      
      // Staleness penalty
      const lastPingTime = latestPing ? new Date(latestPing.timestamp).getTime() : now.getTime();
      const stalenessMs = now.getTime() - lastPingTime;
      const stalenessMins = stalenessMs / (1000 * 60);

      let freshnessMultiplier = 1.0;
      if (stalenessMins > 0.5) {
        // loose 5% confidence for every minute of GPS inactivity, down to a cap
        freshnessMultiplier = Math.max(0.6, 1.0 - (stalenessMins - 0.5) * 0.05);
      }

      // Speed correlation penalty (stability check)
      const speedDiff = Math.abs(currentSpeed - rollingAvgSpeed);
      const stabilityMultiplier = speedDiff > 15 ? 0.95 : 1.0;

      const finalConfidence = Math.min(0.98, Math.max(0.4, baseConfidence * freshnessMultiplier * stabilityMultiplier));
      const arrival = new Date(now.getTime() + predictedEta * 60 * 1000);

      return {
        predicted_eta_minutes: Math.round(predictedEta * 10) / 10,
        arrival_time_iso: arrival.toISOString(),
        confidence_score: Math.round(finalConfidence * 100) / 100,
        model_used: 'AI_RidgeRegression_v1',
        features: {
          distance_km: Math.round(distanceKm * 100) / 100,
          current_speed_kmh: Math.round(currentSpeed * 10) / 10,
          rolling_avg_speed: Math.round(rollingAvgSpeed * 10) / 10,
          traffic_delay_minutes: Math.round(scheduledDelayMinutes * 10) / 10
        }
      };
    } catch (err) {
      console.error('Prediction failed. Falling back to physical heuristics...', err);
    }
  }

  // PHYSICAL HEURISTIC FALLBACK (distance / average speed)
  // Rural speed standard on state highways is ~30 km/h average including stop times
  const avgHeuristicSpeedKmh = 35;
  const estimatedHours = distanceKm / avgHeuristicSpeedKmh;
  const estimatedMins = Math.max(1, estimatedHours * 60);
  const arrival = new Date(now.getTime() + estimatedMins * 60 * 1000);

  return {
    predicted_eta_minutes: Math.round(estimatedMins * 10) / 10,
    arrival_time_iso: arrival.toISOString(),
    confidence_score: 0.65, // Low fallback confidence
    model_used: 'Heuristic_Physical_Speed_Model',
    features: {
      distance_km: Math.round(distanceKm * 100) / 100,
      current_speed_kmh: currentSpeed,
      rolling_avg_speed: currentSpeed,
      traffic_delay_minutes: 0
    }
  };
}
