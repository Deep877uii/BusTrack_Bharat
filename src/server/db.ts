import fs from 'fs';
import path from 'path';
import { Bus, Route, Stop, Schedule, GpsPing, EtaPrediction } from './types.js';

interface DatabaseSchema {
  buses: Bus[];
  routes: Route[];
  stops: Stop[];
  schedules: Schedule[];
  gps_pings: GpsPing[];
  eta_predictions: EtaPrediction[];
}

const DB_FILE_PATH = path.resolve(process.cwd(), 'src/server/db.json');

// High-fidelity seed data
const SEED_ROUTES: Route[] = [
  {
    id: 'route-1',
    name: 'Jaipur - Chomu Rural Stand (R-1)',
    description: 'Serving rural farming corridors of Kukas and Achrol.'
  },
  {
    id: 'route-2',
    name: 'Pune - Saswad Regional (R-2)',
    description: 'Connecting Pune Swargate to historical Jejuri temple hills via Dive Ghat.'
  },
  {
    id: 'route-3',
    name: 'Bengaluru - Devanahalli Village (R-3)',
    description: 'Linking northern city borders with agrarian hamlets around Avati.'
  },
  {
    id: 'route-4',
    name: 'Gwalior - Tansen Nagar to Amity University (R-4)',
    description: 'Linking historic Tansen Nagar, Gwalior Railway junction, and Amity University Campus.'
  }
];

const SEED_STOPS: Stop[] = [
  // Jaipur - Chomu Route
  { id: 'stop-1-1', name: 'Sindhi Camp bus terminal (Jaipur)', lat: 26.9239, lng: 75.7996, sequence_order: 1, route_id: 'route-1' },
  { id: 'stop-1-2', name: 'Amer Fort Junction', lat: 26.9855, lng: 75.8513, sequence_order: 2, route_id: 'route-1' },
  { id: 'stop-1-3', name: 'Kukas Hub Chowk', lat: 27.0315, lng: 75.8920, sequence_order: 3, route_id: 'route-1' },
  { id: 'stop-1-4', name: 'Achrol Rural Stand', lat: 27.1350, lng: 75.9550, sequence_order: 4, route_id: 'route-1' },
  { id: 'stop-1-5', name: 'Chomu Bus Depot', lat: 27.1685, lng: 75.7214, sequence_order: 5, route_id: 'route-1' },

  // Pune - Saswad Route
  { id: 'stop-2-1', name: 'Pune Swargate Depot', lat: 18.5018, lng: 73.8636, sequence_order: 1, route_id: 'route-2' },
  { id: 'stop-2-2', name: 'Hadapsar Corner', lat: 18.5089, lng: 73.9259, sequence_order: 2, route_id: 'route-2' },
  { id: 'stop-2-3', name: 'Dive Ghat View Halt', lat: 18.4520, lng: 73.9850, sequence_order: 3, route_id: 'route-2' },
  { id: 'stop-2-4', name: 'Saswad Rural Terminal', lat: 18.3425, lng: 74.0298, sequence_order: 4, route_id: 'route-2' },
  { id: 'stop-2-5', name: 'Jejuri Temple Halt', lat: 18.2750, lng: 74.1650, sequence_order: 5, route_id: 'route-2' },

  // Bengaluru - Devanahalli Route
  { id: 'stop-3-1', name: 'Kempegowda Bus Station (Majestic)', lat: 12.9779, lng: 77.5716, sequence_order: 1, route_id: 'route-3' },
  { id: 'stop-3-2', name: 'Yelahanka Satellite Town', lat: 13.1008, lng: 77.5963, sequence_order: 2, route_id: 'route-3' },
  { id: 'stop-3-3', name: 'Bagalur Agro Junction', lat: 13.1328, lng: 77.6744, sequence_order: 3, route_id: 'route-3' },
  { id: 'stop-3-4', name: 'Devanahalli Fort Stand', lat: 13.2483, lng: 77.7126, sequence_order: 4, route_id: 'route-3' },
  { id: 'stop-3-5', name: 'Avati Gram Panchayat', lat: 13.2985, lng: 77.7250, sequence_order: 5, route_id: 'route-3' },

  // Gwalior - Tansen Nagar to Amity University Route
  { id: 'stop-4-1', name: 'Tansen Nagar Crossing', lat: 26.2389, lng: 78.1812, sequence_order: 1, route_id: 'route-4' },
  { id: 'stop-4-2', name: 'Gwalior Railway Station', lat: 26.2201, lng: 78.1884, sequence_order: 2, route_id: 'route-4' },
  { id: 'stop-4-3', name: 'Phoolbagh Square Garden', lat: 26.2238, lng: 78.1763, sequence_order: 3, route_id: 'route-4' },
  { id: 'stop-4-4', name: 'DD Nagar Junction', lat: 26.2575, lng: 78.2095, sequence_order: 4, route_id: 'route-4' },
  { id: 'stop-4-5', name: 'Amity University Campus Gate', lat: 26.2917, lng: 78.2235, sequence_order: 5, route_id: 'route-4' }
];

const SEED_BUSES: Bus[] = [
  {
    id: 'bus-1',
    name: 'Rajrath Express (R-1)',
    number_plate: 'RJ-14-PB-4289',
    capacity: 45,
    current_lat: 26.9239,
    current_lng: 75.7996,
    last_ping_at: new Date().toISOString(),
    passenger_count: 12
  },
  {
    id: 'bus-2',
    name: 'Gramin Seva Humsafar (R-2)',
    number_plate: 'MH-12-QW-8843',
    capacity: 52,
    current_lat: 18.5018,
    current_lng: 73.8636,
    last_ping_at: new Date().toISOString(),
    passenger_count: 38
  },
  {
    id: 'bus-3',
    name: 'KSRTC Grama Vahini (R-3)',
    number_plate: 'KA-03-FA-2090',
    capacity: 50,
    current_lat: 12.9779,
    current_lng: 77.5716,
    last_ping_at: new Date().toISOString(),
    passenger_count: 5
  },
  {
    id: 'bus-4',
    name: 'Gwalior Chambal Humsafar (R-4)',
    number_plate: 'MP-07-G-5512',
    capacity: 50,
    current_lat: 26.2389,
    current_lng: 78.1812,
    last_ping_at: new Date().toISOString(),
    passenger_count: 18
  }
];

const SEED_SCHEDULES: Schedule[] = [
  { id: 'sched-1', bus_id: 'bus-1', route_id: 'route-1', departure_time: '08:00', days_of_week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'sched-2', bus_id: 'bus-1', route_id: 'route-1', departure_time: '14:30', days_of_week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'sched-3', bus_id: 'bus-2', route_id: 'route-2', departure_time: '09:15', days_of_week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
  { id: 'sched-4', bus_id: 'bus-3', route_id: 'route-3', departure_time: '10:00', days_of_week: ['Monday', 'Wednesday', 'Friday'] },
  { id: 'sched-5', bus_id: 'bus-4', route_id: 'route-4', departure_time: '11:00', days_of_week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }
];

class FileDatabase {
  private data: DatabaseSchema;
  private isInMemoryOnly: boolean = false;

  constructor() {
    // Pre-initialize with high-fidelity seed data so we are NEVER empty, even if loading fails!
    this.data = {
      buses: JSON.parse(JSON.stringify(SEED_BUSES)),
      routes: JSON.parse(JSON.stringify(SEED_ROUTES)),
      stops: JSON.parse(JSON.stringify(SEED_STOPS)),
      schedules: JSON.parse(JSON.stringify(SEED_SCHEDULES)),
      gps_pings: [],
      eta_predictions: []
    };
    this.load();
  }

  private load() {
    try {
      // Ensure parent directory exists
      const dirname = path.dirname(DB_FILE_PATH);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }

      if (fs.existsSync(DB_FILE_PATH)) {
        const fileContent = fs.readFileSync(DB_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed && typeof parsed === 'object') {
          const loadedBuses = parsed.buses || [];
          const loadedRoutes = parsed.routes || [];
          const loadedStops = parsed.stops || [];
          const loadedSchedules = parsed.schedules || [];

          // Ensure all high-fidelity seeds (like route-4, bus-4) are merged in case the loaded JSON was from an older version
          SEED_BUSES.forEach(seedBus => {
            if (!loadedBuses.some((b: any) => b.id === seedBus.id)) {
              loadedBuses.push(JSON.parse(JSON.stringify(seedBus)));
            }
          });

          SEED_ROUTES.forEach(seedRoute => {
            if (!loadedRoutes.some((r: any) => r.id === seedRoute.id)) {
              loadedRoutes.push(JSON.parse(JSON.stringify(seedRoute)));
            }
          });

          SEED_STOPS.forEach(seedStop => {
            if (!loadedStops.some((s: any) => s.id === seedStop.id)) {
              loadedStops.push(JSON.parse(JSON.stringify(seedStop)));
            }
          });

          SEED_SCHEDULES.forEach(seedSched => {
            if (!loadedSchedules.some((s: any) => s.id === seedSched.id)) {
              loadedSchedules.push(JSON.parse(JSON.stringify(seedSched)));
            }
          });

          this.data = {
            buses: loadedBuses,
            routes: loadedRoutes,
            stops: loadedStops,
            schedules: loadedSchedules,
            gps_pings: parsed.gps_pings || [],
            eta_predictions: parsed.eta_predictions || []
          };
          this.save();
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('⚠️ File system database load failed. No worries!');
      console.warn('🔄 Running in ultra-stable In-Memory Database Mode with initial seeded routes and stations.');
      this.isInMemoryOnly = true;
    }
  }

  private save() {
    if (this.isInMemoryOnly) return;
    try {
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('⚠️ Failed to save database to disk. Switching live state to safe In-Memory mode to prevent crashes:', err);
      this.isInMemoryOnly = true;
    }
  }

  private seed() {
    console.log('Seeding fresh BusTrack Bharat local database...');
    this.data = {
      buses: JSON.parse(JSON.stringify(SEED_BUSES)),
      routes: JSON.parse(JSON.stringify(SEED_ROUTES)),
      stops: JSON.parse(JSON.stringify(SEED_STOPS)),
      schedules: JSON.parse(JSON.stringify(SEED_SCHEDULES)),
      gps_pings: [],
      eta_predictions: []
    };
    this.save();
  }

  // Buses API
  getBuses(): Bus[] { return this.data.buses; }
  getBus(id: string): Bus | undefined { return this.data.buses.find(b => b.id === id); }
  addBus(bus: Omit<Bus, 'id' | 'current_lat' | 'current_lng' | 'last_ping_at'> & { current_lat?: number, current_lng?: number }): Bus {
    const newBus: Bus = {
      ...bus,
      id: `bus-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      current_lat: bus.current_lat ?? SEED_STOPS[0].lat,
      current_lng: bus.current_lng ?? SEED_STOPS[0].lng,
      last_ping_at: new Date().toISOString()
    };
    this.data.buses.push(newBus);
    this.save();
    return newBus;
  }
  updateBusLocation(id: string, lat: number, lng: number, passenger_count?: number): Bus | undefined {
    const bus = this.data.buses.find(b => b.id === id);
    if (bus) {
      bus.current_lat = lat;
      bus.current_lng = lng;
      bus.last_ping_at = new Date().toISOString();
      if (passenger_count !== undefined) {
        bus.passenger_count = passenger_count;
      }
      this.save();
    }
    return bus;
  }
  deleteBus(id: string) {
    this.data.buses = this.data.buses.filter(b => b.id !== id);
    this.data.schedules = this.data.schedules.filter(s => s.bus_id !== id);
    this.save();
  }

  // Routes API
  getRoutes(): Route[] { return this.data.routes; }
  getRoute(id: string): Route | undefined { return this.data.routes.find(r => r.id === id); }
  addRoute(route: Omit<Route, 'id'>): Route {
    const newRoute: Route = {
      ...route,
      id: `route-${Date.now()}`
    };
    this.data.routes.push(newRoute);
    this.save();
    return newRoute;
  }
  deleteRoute(id: string) {
    this.data.routes = this.data.routes.filter(r => r.id !== id);
    this.data.stops = this.data.stops.filter(s => s.route_id !== id);
    this.data.schedules = this.data.schedules.filter(s => s.route_id !== id);
    this.save();
  }

  // Stops API
  getStops(): Stop[] { return this.data.stops; }
  getStopsByRoute(routeId: string): Stop[] {
    return this.data.stops
      .filter(s => s.route_id === routeId)
      .sort((a, b) => a.sequence_order - b.sequence_order);
  }
  addStop(stop: Omit<Stop, 'id'>): Stop {
    const newStop: Stop = {
      ...stop,
      id: `stop-${Date.now()}`
    };
    this.data.stops.push(newStop);
    this.save();
    return newStop;
  }
  deleteStop(id: string) {
    this.data.stops = this.data.stops.filter(s => s.id !== id);
    this.save();
  }

  // Schedules API
  getSchedules(): Schedule[] { return this.data.schedules; }
  addSchedule(schedule: Omit<Schedule, 'id'>): Schedule {
    const newSchedule: Schedule = {
      ...schedule,
      id: `sched-${Date.now()}`
    };
    this.data.schedules.push(newSchedule);
    this.save();
    return newSchedule;
  }
  deleteSchedule(id: string) {
    this.data.schedules = this.data.schedules.filter(s => s.id !== id);
    this.save();
  }

  // GPS Pings API
  getPings(): GpsPing[] { return this.data.gps_pings; }
  addPing(ping: Omit<GpsPing, 'id'>): GpsPing {
    const newPing: GpsPing = {
      ...ping,
      id: `ping-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
    };
    this.data.gps_pings.push(newPing);
    
    // Prune excessive ping count representation to keep the DB size lean (e.g. max 5000 records)
    if (this.data.gps_pings.length > 5000) {
      this.data.gps_pings = this.data.gps_pings.slice(this.data.gps_pings.length - 3000);
    }
    
    this.save();
    return newPing;
  }
  getBusPingHistory(busId: string, limit: number = 20): GpsPing[] {
    return this.data.gps_pings
      .filter(p => p.bus_id === busId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
  getLatestPing(busId: string): GpsPing | undefined {
    return this.data.gps_pings
      .filter(p => p.bus_id === busId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
  }

  // ETA Predictions API
  getEtaPredictions(): EtaPrediction[] { return this.data.eta_predictions; }
  upsertEtaPrediction(pred: Omit<EtaPrediction, 'id' | 'created_at'>): EtaPrediction {
    const idx = this.data.eta_predictions.findIndex(p => p.bus_id === pred.bus_id && p.stop_id === pred.stop_id);
    const updatedPred: EtaPrediction = {
      ...pred,
      id: idx >= 0 ? this.data.eta_predictions[idx].id : `eta-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      created_at: new Date().toISOString()
    };
    if (idx >= 0) {
      this.data.eta_predictions[idx] = updatedPred;
    } else {
      this.data.eta_predictions.push(updatedPred);
    }
    this.save();
    return updatedPred;
  }
}

export const db = new FileDatabase();
