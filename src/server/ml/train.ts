import fs from 'fs';
import path from 'path';

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

// Haversine distance calculator
export function getHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function trainModel() {
  console.log('🤖 ML TRAINER: Starting synthetic data generation for 10,000+ records (6 months history)...');

  const N = 12000; // Generate 12k data points
  const featureNames = [
    'distance_to_stop_km',
    'current_speed_kmh',
    'time_of_day',
    'day_of_week',
    'stop_sequence_number',
    'rolling_avg_speed_last_5_pings',
    'scheduled_delay_minutes'
  ];

  const X: number[][] = [];
  const y: number[] = [];

  for (let i = 0; i < N; i++) {
    // 1. Feature: Distance to stop (0.1km to 30km)
    const distance = Math.random() * 25 + 0.1;

    // 2. Feature: Current Speed (20km/h to 60km/h)
    const speed = Math.random() * 40 + 20;

    // 3. Feature: Time of Day (0 to 24, peaking active hours 7am - 9pm)
    const timeOfDay = Math.random() * 15 + 6.5; // Decimal hours 06:30 to 21:30

    // 4. Feature: Day of Week (0 = Monday, 6 = Sunday)
    const dayOfWeek = Math.floor(Math.random() * 7);

    // 5. Feature: Stop sequence number (1 to 5)
    const seqNum = Math.floor(Math.random() * 5) + 1;

    // 6. Feature: Rolling speed last 5 pings (slightly correlated with current speed)
    const rollingSpeed = speed * 0.8 + (Math.random() * 10 + 5) * 0.2;

    // 7. Feature: Scheduled Delay (minutes, can be negative early or positive late)
    // Delays are higher during evening rush hour (17.0 to 19.5) and weekend tourist times
    const isRushHour = (timeOfDay >= 8 && timeOfDay <= 10) || (timeOfDay >= 17 && timeOfDay <= 19.5);
    const trafficSlowerMultiplier = isRushHour ? 1.4 : 1.0;
    const isWeekend = dayOfWeek >= 5;
    const baseDelay = isRushHour ? (Math.random() * 20 + 10) : (Math.random() * 10);
    const delay = baseDelay + (isWeekend ? Math.random() * 12 : 0);

    // Calculate actual travel time (ground truth) minutes with direct correlations plus random physical effects
    // travel_time ~ distance / speed * 60 minutes
    const idealTime = (distance / (speed * 0.9)) * 60;
    
    // Traffic slowdowns
    const trafficDelay = isRushHour ? (distance * 0.8) : (distance * 0.1);
    
    // Random noise (weather, passenger loading times, roads)
    const roadNoise = Math.random() * 3 - 1.5;

    // Output target variable: actual travel time in minutes
    let travelTime = idealTime + trafficDelay + (delay * 0.05) + (seqNum * 0.5) + roadNoise;
    travelTime = Math.max(1, travelTime); // minimum 1 minute travel time

    X.push([distance, speed, timeOfDay, dayOfWeek, seqNum, rollingSpeed, delay]);
    y.push(travelTime);
  }

  // Split into 80% Train, 20% Test
  const trainSize = Math.floor(N * 0.8);
  const X_train = X.slice(0, trainSize);
  const y_train = y.slice(0, trainSize);
  const X_test = X.slice(trainSize);
  const y_test = y.slice(trainSize);

  // Feature Standardisation (extremely important for stable Gradient Descent)
  const numFeatures = featureNames.length;
  const means = Array(numFeatures).fill(0);
  const stds = Array(numFeatures).fill(0);

  // Compute Mean and Std of Training Set
  for (let j = 0; j < numFeatures; j++) {
    let sum = 0;
    for (let i = 0; i < trainSize; i++) {
        sum += X_train[i][j];
    }
    means[j] = sum / trainSize;

    let sqDiffSum = 0;
    for (let i = 0; i < trainSize; i++) {
        sqDiffSum += Math.pow(X_train[i][j] - means[j], 2);
    }
    stds[j] = Math.sqrt(sqDiffSum / trainSize) || 1.0; // avoid divide by zero
  }

  // Standardise training data: Z = (X - mean) / std
  const X_train_std = X_train.map(row => 
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  // Train Multiple Linear Regression using Gradient Descent
  const coefficients = Array(numFeatures).fill(0).map(() => Math.random() * 0.1 - 0.05);
  let intercept = y_train.reduce((a, b) => a + b, 0) / trainSize; // Seed with average output

  const alpha = 0.01; // Learning rate
  const epochs = 150;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let d_intercept = 0;
    const d_coef = Array(numFeatures).fill(0);

    for (let i = 0; i < trainSize; i++) {
      let pred = intercept;
      for (let j = 0; j < numFeatures; j++) {
        pred += coefficients[j] * X_train_std[i][j];
      }
      const error = pred - y_train[i];

      d_intercept += error;
      for (let j = 0; j < numFeatures; j++) {
        d_coef[j] += error * X_train_std[i][j];
      }
    }

    // Update weights
    intercept -= (alpha * d_intercept) / trainSize;
    for (let j = 0; j < numFeatures; j++) {
      coefficients[j] -= (alpha * d_coef[j]) / trainSize;
    }
  }

  // Evaluation on Test Dataset
  // First standardised test features using training statistics
  const X_test_std = X_test.map(row => 
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  let absErrorSum = 0;
  let sqErrorSum = 0;
  
  // To compute R2, we need mean of target on test set
  const y_test_mean = y_test.reduce((a, b) => a + b, 0) / y_test.length;
  let totalSumOfSquares = 0;

  const testPredictions: number[] = [];

  for (let i = 0; i < y_test.length; i++) {
    let pred = intercept;
    for (let j = 0; j < numFeatures; j++) {
      pred += coefficients[j] * X_test_std[i][j];
    }
    pred = Math.max(1, pred); // can't have negative durations
    testPredictions.push(pred);

    const actual = y_test[i];
    absErrorSum += Math.abs(pred - actual);
    sqErrorSum += Math.pow(pred - actual, 2);
    totalSumOfSquares += Math.pow(actual - y_test_mean, 2);
  }

  const mae = absErrorSum / y_test.length;
  const rmse = Math.sqrt(sqErrorSum / y_test.length);
  const r2 = 1 - (sqErrorSum / totalSumOfSquares);

  console.log(`📡 ML MODEL EVALUATION RESULTS:`);
  console.log(`   - Data Points: ${N} (Train: ${trainSize}, Test: ${y_test.length})`);
  console.log(`   - Mean Absolute Error (MAE): ${mae.toFixed(3)} minutes`);
  console.log(`   - Root Mean Squared Error (RMSE): ${rmse.toFixed(3)} minutes`);
  console.log(`   - R-squared (R²) Score: ${r2.toFixed(4)}`);

  console.log('📊 Standardized Feature Importances (Coefficient weights):');
  coefficients.forEach((val, index) => {
    console.log(`   - ${featureNames[index]}: ${val.toFixed(3)}`);
  });

  // Ensure output directory exists before writing
  if (!fs.existsSync(MODEL_DIR_PATH)) {
    fs.mkdirSync(MODEL_DIR_PATH, { recursive: true });
  }

  const modelData: ModelWeights = {
    coefficients,
    intercept,
    featureNames,
    means,
    stds,
    mae,
    rmse,
    r2,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(MODEL_FILE_PATH, JSON.stringify(modelData, null, 2), 'utf-8');
  console.log(`🎉 Model weights saved successfully to: ${MODEL_FILE_PATH}`);

  return modelData;
}
