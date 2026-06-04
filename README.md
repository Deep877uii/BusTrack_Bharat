# 🚌 BusTrack Bharat — Urban & Rural Transit GPS Tracking System

BusTrack Bharat is a high-fidelity, full-stack transit mapping, routing, and real-time AI-predicted ETA system designed for urban-rural corridors in India. It includes separate dashboards for **Passengers**, **Drivers**, and **Administrators**, and runs effortlessly on both remote systems and your local machine.

---

## 🚀 Quick Start: Run Locally Today (Zero Configuration)

The application has been engineered to be **entirely self-contained**. It utilizes a built-in file-based JSON storage database (`src/server/db.json`) that seeds automatically with high-fidelity geospatial routes and stations. **You do not need to install or run PostgreSQL or any external databases** to run the app on your computer right now!

### Step 1: Install Dependencies
Open your terminal inside the project directory and run:
```bash
npm install
```

### Step 2: Start the Development Server
Run the unified Vite development command:
```bash
npm run dev
```

### Step 3: Open the Web Browser
Open [http://localhost:3000](http://localhost:3000) to view:
* **Passenger Console** with Leaflet interactive route maps, GPS location updates, and simulated routes.
* **Driver Console** to check-in/simulate live arrival sequences.
* **Admin dashboard** for CRUD operations (add/remove buses & routes).

---

## 🐘 Optional: Switch to PostgreSQL

If you choose to scale the system or host it with a real **PostgreSQL** backend on your machine, we have prepared the database schema structure below.

### 1. Execute SQL Schema
Create a PostgreSQL database (e.g., `bustrack_db`) and execute the following SQL to set up the corresponding tables:

```sql
-- Create Routes Table
CREATE TABLE routes (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

-- Create Stops Table
CREATE TABLE stops (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    sequence_order INT NOT NULL,
    route_id VARCHAR(50) REFERENCES routes(id) ON DELETE CASCADE
);

-- Create Buses Table
CREATE TABLE buses (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    number_plate VARCHAR(50) UNIQUE NOT NULL,
    capacity INT DEFAULT 40,
    current_lat DOUBLE PRECISION NOT NULL,
    current_lng DOUBLE PRECISION NOT NULL,
    last_ping_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    passenger_count INT DEFAULT 0
);

-- Create Schedules Table
CREATE TABLE schedules (
    id VARCHAR(50) PRIMARY KEY,
    bus_id VARCHAR(50) REFERENCES buses(id) ON DELETE CASCADE,
    route_id VARCHAR(50) REFERENCES routes(id) ON DELETE CASCADE,
    departure_time VARCHAR(10) NOT NULL,
    days_of_week VARCHAR(100)[] NOT NULL
);

-- Create GPS Pings Table (Realtime History)
CREATE TABLE gps_pings (
    id VARCHAR(50) PRIMARY KEY,
    bus_id VARCHAR(50) REFERENCES buses(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    speed_kmh DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    passenger_count INT NOT NULL
);

-- Create ETA Predictions Table (Caching)
CREATE TABLE status_eta_predictions (
    id VARCHAR(50) PRIMARY KEY,
    bus_id VARCHAR(50) NOT NULL,
    stop_id VARCHAR(50) NOT NULL,
    predicted_eta_minutes INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Live Seeding Data
Insert the pre-configured high-fidelity Indian rural Transit routes in your PostgreSQL database:

```sql
-- Seed Routes
INSERT INTO routes (id, name, description) VALUES
('route-1', 'Jaipur - Chomu Rural Stand (R-1)', 'Serving rural farming corridors of Kukas and Achrol.'),
('route-2', 'Pune - Saswad Regional (R-2)', 'Connecting Pune Swargate to historical Jejuri temple hills via Dive Ghat.'),
('route-3', 'Bengaluru - Devanahalli Village (R-3)', 'Linking northern city borders with agrarian hamlets around Avati.');

-- Seed Stops
INSERT INTO stops (id, name, lat, lng, sequence_order, route_id) VALUES
('stop-1-1', 'Sindhi Camp bus terminal (Jaipur)', 26.9239, 75.7996, 1, 'route-1'),
('stop-1-2', 'Amer Fort Junction', 26.9855, 75.8513, 2, 'route-1'),
('stop-1-3', 'Kukas Hub Chowk', 27.0315, 75.8920, 3, 'route-1'),
('stop-1-4', 'Achrol Rural Stand', 27.1350, 75.9550, 4, 'route-1'),
('stop-1-5', 'Chomu Bus Depot', 27.1685, 75.7214, 5, 'route-1'),

('stop-2-1', 'Pune Swargate Depot', 18.5018, 73.8636, 1, 'route-2'),
('stop-2-2', 'Hadapsar Corner', 18.5089, 73.9259, 2, 'route-2'),
('stop-2-3', 'Dive Ghat View Halt', 18.4520, 73.9850, 3, 'route-2'),
('stop-2-4', 'Saswad Rural Terminal', 18.3425, 74.0298, 4, 'route-2'),
('stop-2-5', 'Jejuri Temple Halt', 18.2750, 74.1650, 5, 'route-2'),

('stop-3-1', 'Kempegowda Bus Station (Majestic)', 12.9779, 77.5716, 1, 'route-3'),
('stop-3-2', 'Yelahanka Satellite Town', 13.1008, 77.5963, 2, 'route-3'),
('stop-3-3', 'Bagalur Agro Junction', 13.1328, 77.6744, 3, 'route-3'),
('stop-3-4', 'Devanahalli Fort Stand', 13.2483, 77.7126, 4, 'route-3'),
('stop-3-5', 'Avati Gram Panchayat', 13.2985, 77.7250, 5, 'route-3');

-- Seed Buses
INSERT INTO buses (id, name, number_plate, capacity, current_lat, current_lng, passenger_count) VALUES
('bus-1', 'Rajrath Express (R-1)', 'RJ-14-PB-4289', 45, 26.9239, 75.7996, 12),
('bus-2', 'Gramin Seva Humsafar (R-2)', 'MH-12-QW-8843', 52, 18.5018, 73.8636, 38),
('bus-3', 'KSRTC Grama Vahini (R-3)', 'KA-03-FA-2090', 50, 12.9779, 77.5716, 5);
```

---

## 🛠 Features Included
* 🗾 **Seamless Multi-Map Rendering**: Interactive Leaflet maps with dynamically updating custom markers for stops, current buses, and smooth SVG route polyline draw logic.
* 🛠 **Tab Transitions Invalidation**: Automatic map canvas refresh (`invalidateSize()`) upon switching perspectives (Passenger ↔ Driver ↔ Admin) to guarantee responsive sizing.
* 🧠 **Geospatial AI Predictor**: Computes real-time ETAs and crowd occupancy dynamically.
* 📡 **Live WebSocket Sync**: Real-time push updates of simulator GPS coordinate pings.
