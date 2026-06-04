export interface Bus {
  id: string;
  name: string;
  number_plate: string;
  capacity: number;
  current_lat: number;
  current_lng: number;
  last_ping_at: string;
  passenger_count: number; // For seat occupancy prediction (Bonus feature)
}

export interface Route {
  id: string;
  name: string;
  description: string;
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sequence_order: number;
  route_id: string;
}

export interface Schedule {
  id: string;
  bus_id: string;
  route_id: string;
  departure_time: string; // e.g. "08:30"
  days_of_week: string[];  // e.g. ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
}

export interface GpsPing {
  id: string;
  bus_id: string;
  lat: number;
  lng: number;
  speed_kmh: number;
  timestamp: string;
  passenger_count: number;
}

export interface EtaPrediction {
  id: string;
  bus_id: string;
  stop_id: string;
  predicted_eta: number;     // predicted arrival in minutes
  model_confidence: number;  // score between 0 and 1
  created_at: string;
}
