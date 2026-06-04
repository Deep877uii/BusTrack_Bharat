import express, { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { predictEta } from './ml/predict.js';
import { initSimulator, triggerDriverArrivedAtStop, resetSimulatorForActiveBus, reinitializeSimulator } from './simulator.js';
import { Bus } from './types.js';
import { WebSocket, WebSocketServer } from 'ws';
import { Server as HttpServer } from 'http';

export const backendApp = express();

// Parse JSON bodies
backendApp.use(express.json());

// Logger middleware for debugging
backendApp.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`📡 [API] ${req.method} ${req.url}`);
  next();
});

// PASSENGER ENDPOINTS
// 1. Get List of all Routes
backendApp.get('/api/routes', (req: Request, res: Response) => {
  res.json(db.getRoutes());
});

// 2. Get Stops with sequence order for a specific Route
backendApp.get('/api/routes/:route_id/stops', (req: Request, res: Response) => {
  const { route_id } = req.params;
  const stops = db.getStopsByRoute(route_id);
  res.json(stops);
});

// 3. Get all active bus positions
backendApp.get('/api/buses/live', (req: Request, res: Response) => {
  res.json(db.getBuses());
});

// 4. Get AI-Predicted ETA for a bus reaching a stop
backendApp.get('/api/eta/:bus_id/:stop_id', (req: Request, res: Response) => {
  const { bus_id, stop_id } = req.params;
  try {
    const prediction = predictEta(bus_id, stop_id);
    res.json(prediction);
  } catch (err: any) {
    res.status(404).json({ error: err.message || 'ETA prediction calculation failed' });
  }
});

// GPS / SIMULATOR ENDPOINTS
// 1. Accept external GPS ping (manual trigger/device simulations)
backendApp.post('/api/gps/ping', (req: Request, res: Response) => {
  const { bus_id, lat, lng, speed_kmh, passenger_count } = req.body;
  if (!bus_id || lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'Missing bus_id, lat, or lng parameters' });
    return;
  }

  const speed = speed_kmh !== undefined ? Number(speed_kmh) : 30;
  const passengers = passenger_count !== undefined ? Number(passenger_count) : 10;

  // Insert to database & update current state
  db.updateBusLocation(bus_id, Number(lat), Number(lng), passengers);
  const newPing = db.addPing({
    bus_id,
    lat: Number(lat),
    lng: Number(lng),
    speed_kmh: speed,
    timestamp: new Date().toISOString(),
    passenger_count: passengers
  });

  // Broadcast update to frontends
  const bus = db.getBus(bus_id);
  if (bus) {
    broadcastToClients({
      type: 'BUS_UPDATE',
      busId: bus_id,
      lat: Number(lat),
      lng: Number(lng),
      speed_kmh: speed,
      passenger_count: passengers,
      last_ping_at: newPing.timestamp,
      busName: bus.name,
      numberPlate: bus.number_plate
    });
  }

  res.status(251).json({ status: 'success', ping: newPing });
});

// 2. Get history pings for a specific Bus
backendApp.get('/api/gps/bus/:bus_id/history', (req: Request, res: Response) => {
  const { bus_id } = req.params;
  const history = db.getBusPingHistory(bus_id, 30);
  res.json(history);
});

// 3. Reset/Update Active Bus Route simulation assignment
backendApp.post('/api/gps/simulator/reset', (req: Request, res: Response) => {
  const { bus_id, route_id } = req.body;
  if (!bus_id || !route_id) {
    res.status(400).json({ error: 'Missing bus_id or route_id' });
    return;
  }
  resetSimulatorForActiveBus(bus_id, route_id);
  res.json({ status: 'success', message: `Simulator reset for bus ${bus_id} on route ${route_id}` });
});


// DRIVER ENDPOINTS
// 1. Manual check-in click: "arrived at stop"
backendApp.post('/api/driver/:bus_id/arrived', (req: Request, res: Response) => {
  const { bus_id } = req.params;
  triggerDriverArrivedAtStop(bus_id);
  res.json({ status: 'success', message: `Bus ${bus_id} marked as arrived at current stop` });
});


// ADMIN ENDPOINTS
// 1. Manage Buses (CRUD)
backendApp.get('/api/admin/buses', (req: Request, res: Response) => {
  res.json(db.getBuses());
});

backendApp.post('/api/admin/buses', (req: Request, res: Response) => {
  const { name, number_plate, capacity, passenger_count } = req.body;
  if (!name || !number_plate) {
    res.status(400).json({ error: 'name and number_plate are required' });
    return;
  }
  const bus = db.addBus({
    name,
    number_plate,
    capacity: Number(capacity) || 40,
    passenger_count: Number(passenger_count) || 0
  });
  reinitializeSimulator();
  res.status(251).json(bus);
});

backendApp.delete('/api/admin/buses/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.deleteBus(id);
  reinitializeSimulator();
  res.json({ status: 'success', message: `Bus ${id} removed` });
});

// 2. Manage Routes (CRUD)
backendApp.get('/api/admin/routes', (req: Request, res: Response) => {
  res.json(db.getRoutes());
});

backendApp.post('/api/admin/routes', (req: Request, res: Response) => {
  const { name, description } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Route name is required' });
    return;
  }
  const route = db.addRoute({ name, description: description || '' });
  reinitializeSimulator();
  res.status(251).json(route);
});

backendApp.delete('/api/admin/routes/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.deleteRoute(id);
  reinitializeSimulator();
  res.json({ status: 'success', message: `Route ${id} and associated stops/schedules deleted` });
});

// 3. Manage Stops (CRUD)
backendApp.get('/api/admin/stops', (req: Request, res: Response) => {
  res.json(db.getStops());
});

backendApp.post('/api/admin/stops', (req: Request, res: Response) => {
  const { name, lat, lng, sequence_order, route_id } = req.body;
  if (!name || lat === undefined || lng === undefined || !route_id) {
    res.status(400).json({ error: 'name, lat, lng, and route_id are required' });
    return;
  }
  const stop = db.addStop({
    name,
    lat: Number(lat),
    lng: Number(lng),
    sequence_order: Number(sequence_order) || 1,
    route_id
  });
  reinitializeSimulator();
  res.status(251).json(stop);
});

backendApp.delete('/api/admin/stops/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.deleteStop(id);
  reinitializeSimulator();
  res.json({ status: 'success', message: `Stop ${id} deleted` });
});

// 4. Manage Schedules (CRUD)
backendApp.get('/api/admin/schedules', (req: Request, res: Response) => {
  res.json(db.getSchedules());
});

backendApp.post('/api/admin/schedules', (req: Request, res: Response) => {
  const { bus_id, route_id, departure_time, days_of_week } = req.body;
  if (!bus_id || !route_id || !departure_time) {
    res.status(400).json({ error: 'bus_id, route_id, and departure_time are required' });
    return;
  }
  const sched = db.addSchedule({
    bus_id,
    route_id,
    departure_time,
    days_of_week: days_of_week || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  });
  reinitializeSimulator();
  res.status(251).json(sched);
});

backendApp.delete('/api/admin/schedules/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.deleteSchedule(id);
  reinitializeSimulator();
  res.json({ status: 'success', message: `Schedule ${id} deleted` });
});


// WEBSOCKET SHIELD CONNECTIONS MANAGEMENT
const wssClients = new Set<WebSocket>();

export function broadcastToClients(data: any) {
  const payload = JSON.stringify(data);
  wssClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

/**
 * Attaches Express app middleware & WebSocket server to the given HTTP server context.
 * Enables uniform code path execution in both Vite Development server and Production Node server.
 */
export function attachBackend(expressAppParent: any, httpServer: any) {
  // 1. Inject API routes of backendApp into the parent application
  expressAppParent.use(backendApp);

  if (!httpServer) {
    console.warn('⚠️ SERVER: No HTTP Server provided. WebSockets will be unavailable.');
    return;
  }

  // 2. Attach WebSocket server to the same HTTP Server
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/live-tracking') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 WebSocket stream client connected.');
    wssClients.add(ws);

    // Send immediate state sync of current bus positions to newly connected screens
    const currentBuses = db.getBuses();
    ws.send(JSON.stringify({
      type: 'INIT_BUSES',
      buses: currentBuses
    }));

    ws.on('close', () => {
      console.log('🔌 WebSocket stream client disconnected.');
      wssClients.delete(ws);
    });

    ws.on('error', (err) => {
      console.error('⚠️ WebSocket error:', err);
      wssClients.delete(ws);
    });
  });

  // 3. Boot continuous GPS Simulator automatically
  initSimulator((bus, speed) => {
    // Broadcast active location update ticks automatically to all WebSocket browsers
    broadcastToClients({
      type: 'BUS_UPDATE',
      busId: bus.id,
      lat: bus.current_lat,
      lng: bus.current_lng,
      speed_kmh: speed,
      passenger_count: bus.passenger_count,
      last_ping_at: bus.last_ping_at,
      busName: bus.name,
      numberPlate: bus.number_plate
    });
  });
}
