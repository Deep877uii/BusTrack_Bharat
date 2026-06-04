import { db } from './db.js';
import { Stop, Bus } from './types.js';

interface SimulatorState {
  busId: string;
  routeId: string;
  stops: Stop[];
  currentStopIndex: number; // Index of the last/current stop origin
  nextStopIndex: number;    // Index of the next stop destination
  progress: number;         // Decimal percentage completed (0 to 1)
  status: 'MOVING' | 'DWELLING';
  dwellTicksLeft: number;
  direction: 1 | -1;        // 1 = forward, -1 = return trip
}

let activeSimulatorStates: SimulatorState[] = [];
let simInterval: NodeJS.Timeout | null = null;
let onLocationUpdateCallback: ((bus: Bus, speed: number) => void) | null = null;

// Initialize the simulator with currently registered buses and their assigned routes
export function initSimulator(onLocationUpdate: (bus: Bus, speed: number) => void) {
  onLocationUpdateCallback = onLocationUpdate;
  
  const buses = db.getBuses();
  const routes = db.getRoutes();

  activeSimulatorStates = [];

  buses.forEach((bus, i) => {
    // Dynamically match route based on schedule list, otherwise fall back gracefully to a cycling route index
    const schedules = db.getSchedules();
    const scheduledRoute = schedules.find(s => s.bus_id === bus.id);
    const routeId = scheduledRoute ? scheduledRoute.route_id : (routes[i % routes.length]?.id || 'route-1');
    const stops = db.getStopsByRoute(routeId);

    if (stops.length >= 2) {
      activeSimulatorStates.push({
        busId: bus.id,
        routeId,
        stops,
        currentStopIndex: 0,
        nextStopIndex: 1,
        progress: 0,
        status: 'MOVING',
        dwellTicksLeft: 0,
        direction: 1
      });
    }
  });

  // Start continuous simulation loop (runs every 4 seconds)
  // 4 seconds simulation tick represents a fast-forward time of approx 30-45s of physical travel
  if (simInterval) clearInterval(simInterval);
  
  simInterval = setInterval(() => {
    tickSimulation();
  }, 4000);

  console.log('🏁 GPS SIMULATOR: Activated realtime simulation for available state buses.');
}

export function stopSimulator() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

// Manually trigger single simulation tick
export function tickSimulation() {
  activeSimulatorStates.forEach(sim => {
    const bus = db.getBus(sim.busId);
    if (!bus) return;

    if (sim.status === 'DWELLING') {
      sim.dwellTicksLeft--;
      // Zero speed when dwelling at a village stop
      const simulatedSpeed = 0;
      
      // Boarding/de-boarding simulation (bonus crowding prediction)
      if (sim.dwellTicksLeft === 1) {
        let count = bus.passenger_count;
        const change = Math.floor(Math.random() * 15) - 7; // -7 to +7 passenger shift
        count = Math.max(2, Math.min(bus.capacity, count + change));
        bus.passenger_count = count;
      }

      // Update bus location in db
      const originStop = sim.stops[sim.currentStopIndex];
      db.updateBusLocation(bus.id, originStop.lat, originStop.lng, bus.passenger_count);
      
      // Log ping
      const ping = db.addPing({
        bus_id: bus.id,
        lat: originStop.lat,
        lng: originStop.lng,
        speed_kmh: simulatedSpeed,
        timestamp: new Date().toISOString(),
        passenger_count: bus.passenger_count
      });

      // Notify callback (real-time stream)
      if (onLocationUpdateCallback) onLocationUpdateCallback({ ...bus, current_lat: originStop.lat, current_lng: originStop.lng }, simulatedSpeed);

      if (sim.dwellTicksLeft <= 0) {
        sim.status = 'MOVING';
        sim.progress = 0;
      }
    } else {
      // MOVING
      const oStop = sim.stops[sim.currentStopIndex];
      const dStop = sim.stops[sim.nextStopIndex];

      // Physical distance between these stops
      const R = 6371; // km
      const dLat = (dStop.lat - oStop.lat) * Math.PI / 180;
      const dLon = (dStop.lng - oStop.lng) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(oStop.lat * Math.PI / 180) * Math.cos(dStop.lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distanceBetweenStopsKm = R * c;

      // Realistic Physics: Speed profiles (accelerates, cruising, decelerating)
      let currentBaseSpeed = 42; // Rural highway cruising speed (km/h)
      
      if (sim.progress < 0.20) {
        // Accelerating
        currentBaseSpeed = 15 + (sim.progress / 0.20) * 27;
      } else if (sim.progress > 0.80) {
        // Decelerating for arrival halt
        currentBaseSpeed = 8 + ((1.0 - sim.progress) / 0.20) * 34;
      }

      // Add rural road noise/bumpy road slowing
      const noise = Math.random() * 10 - 5; // ±5 km/h variance
      const finalSimulatedSpeed = Math.max(12, Math.min(65, currentBaseSpeed + noise));

      // 4-second tick step in hours
      const tickDurationHours = 4 / 3600 * 15; // fast forward speed by 15x
      const distanceTraveledKm = finalSimulatedSpeed * tickDurationHours;

      // Progress increment
      sim.progress += distanceTraveledKm / distanceBetweenStopsKm;

      if (sim.progress >= 1.0) {
        // Reached destination stop! Shift to Dwelling.
        sim.progress = 1.0;
        sim.status = 'DWELLING';
        sim.dwellTicksLeft = Math.floor(Math.random() * 3) + 2; // Dwell for 2 to 4 ticks (8s to 16s)
        
        sim.currentStopIndex = sim.nextStopIndex;
        
        // Calculate next stop in sequence
        const sequenceLength = sim.stops.length;
        if (sim.direction === 1) {
          if (sim.currentStopIndex === sequenceLength - 1) {
            // Reached final stop, turn around!
            sim.direction = -1;
            sim.nextStopIndex = sequenceLength - 2;
          } else {
            sim.nextStopIndex = sim.currentStopIndex + 1;
          }
        } else {
          if (sim.currentStopIndex === 0) {
            // Reached start, head forward!
            sim.direction = 1;
            sim.nextStopIndex = 1;
          } else {
            sim.nextStopIndex = sim.currentStopIndex - 1;
          }
        }
      }

      // Interpolate current lat/lng position
      const interpLat = oStop.lat + (dStop.lat - oStop.lat) * sim.progress;
      const interpLng = oStop.lng + (dStop.lng - oStop.lng) * sim.progress;

      // Update bus in database
      db.updateBusLocation(bus.id, interpLat, interpLng, bus.passenger_count);

      // Log ping
      const ping = db.addPing({
        bus_id: bus.id,
        lat: interpLat,
        lng: interpLng,
        speed_kmh: Math.round(finalSimulatedSpeed),
        timestamp: new Date().toISOString(),
        passenger_count: bus.passenger_count
      });

      // Update bus local fields
      const updatedBus = {
        ...bus,
        current_lat: interpLat,
        current_lng: interpLng,
        last_ping_at: ping.timestamp
      };

      // Realtime trigger
      if (onLocationUpdateCallback) {
        onLocationUpdateCallback(updatedBus, Math.round(finalSimulatedSpeed));
      }
    }
  });
}

// Support driver-specific simulation actions
export function triggerDriverArrivedAtStop(busId: string) {
  const sim = activeSimulatorStates.find(s => s.busId === busId);
  if (sim && sim.status === 'MOVING') {
    sim.progress = 1.0;
    sim.status = 'DWELLING';
    sim.dwellTicksLeft = 4;
    console.log(`🚌 DRIVER OPTION: Bus ${busId} manually checked in as ARRIVED.`);
    tickSimulation();
  }
}

// Reset or trigger specific route simulator
export function resetSimulatorForActiveBus(busId: string, routeId: string) {
  const sim = activeSimulatorStates.find(s => s.busId === busId);
  const stops = db.getStopsByRoute(routeId);
  if (sim && stops.length >= 2) {
    sim.routeId = routeId;
    sim.stops = stops;
    sim.currentStopIndex = 0;
    sim.nextStopIndex = 1;
    sim.progress = 0;
    sim.status = 'MOVING';
    sim.dwellTicksLeft = 0;
    sim.direction = 1;

    const bus = db.getBus(busId);
    if (bus) {
      db.updateBusLocation(bus.id, stops[0].lat, stops[0].lng, bus.passenger_count);
    }
    console.log(`🔄 SIMULATOR RESET: Configured bus ${busId} of Route ${routeId}.`);
    tickSimulation();
  }
}

// Reinitialize states dynamically when buses/routes/schedules change on the administrative interface
export function reinitializeSimulator() {
  if (onLocationUpdateCallback) {
    console.log('🔄 Re-initializing simulator states to dynamically adapt to administrative changes...');
    initSimulator(onLocationUpdateCallback);
  }
}

