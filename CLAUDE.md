# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a vendor-neutral Building/Battery Management System (BMS) data layer using a **hybrid database architecture**: InfluxDB for high-frequency timeseries data and Memgraph for equipment hierarchy and control relationships.

## Development Commands

### Build & Run
```bash
npm run build          # Compile TypeScript to dist/
npm run dev           # Development mode with hot-reload (nodemon + ts-node)
npm start             # Run compiled code from dist/

# Docker environment
docker compose up -d                    # Start all services (Mosquitto, InfluxDB, Memgraph, App)
docker compose up -d --build           # Rebuild and start
docker compose logs -f bms-app         # View application logs
docker compose down                     # Stop all services
```

### Testing
```bash
npm test              # Run all tests (Jest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Code Quality
```bash
npm run lint          # Run ESLint
npm run lint:fix      # Auto-fix ESLint issues
npm run format        # Format code with Prettier
```

### Database Operations

**InfluxDB**
```bash
# Access InfluxDB UI: http://localhost:8086
# Token is in .env: INFLUXDB_TOKEN

# Query from CLI
docker exec -it bms-influxdb influx query 'from(bucket:"bms-metrics") |> range(start:-1h) |> limit(n:10)'
```

**Memgraph**
```bash
# Access Memgraph Lab UI: http://localhost:3000

# Run Cypher query from CLI
docker exec -it bms-memgraph mgconsole --host 127.0.0.1 --port 7687
# Then run Cypher: MATCH (n) RETURN n LIMIT 10;
```

**MQTT**
```bash
# Subscribe to all BMS topics
mosquitto_sub -h localhost -p 1883 -t '+/+/+/+/#' -v

# Publish test telemetry
mosquitto_pub -h localhost -p 1883 -t 'acme/building-a/floor-2/AHU-01/telemetry' \
  -m '{"timestamp":"2025-12-26T20:00:00Z","equipment_id":"AHU-01","vendor":"generic","metrics":{"value":72.5}}'
```

## Architecture

### Hybrid Database Strategy

This project uses **two specialized databases** instead of one general-purpose database:

1. **InfluxDB** - Timeseries metrics only
   - Tag-based data model: `equipment_metrics` measurement
   - Tags: site_id, floor, zone, equipment_id, point_id, vendor
   - Fields: value, quality, status, alarm_state
   - Handles 1000+ writes/sec
   - Automatic retention (7d raw, 30d 1-min, 90d 5-min, 2yr hourly)

2. **Memgraph** - Equipment hierarchy & relationships only
   - Graph nodes: Site → Floor → Zone → Equipment → Point
   - Relationships: HAS_FLOOR, CONTAINS, CONTROLS, POWERS, FEEDS
   - Sub-millisecond queries for "what controls what?"
   - Control sequences: STARTS_BEFORE, SHUTS_DOWN_AFTER
   - In-memory for real-time impact analysis

**Why Two Databases?**
- InfluxDB excels at high-frequency writes and time-range queries
- Memgraph excels at complex relationships and graph traversal
- Each database does what it's best at → better performance
- Queries combine data from both in the API layer

### Data Flow

```
MQTT (Mosquitto)
    ↓
MQTT Subscriber → Topic Router
    ↓
Vendor Parser (normalizes Tesla, CATL, LG, Generic formats)
    ↓
    ├─→ InfluxDB Writer (batch: 1000 points, 1s flush)
    │     → equipment_metrics measurement
    │
    └─→ Memgraph Manager
          → Create/update nodes & relationships
    ↓
GraphQL API (Apollo Server)
    ├─→ Query resolvers (merge InfluxDB + Memgraph data)
    ├─→ Mutation resolvers (create/update entities & relationships)
    └─→ Dynamic entity/relationship definitions
          → Users can define custom node types & edges
```

### MQTT Topic Structure

Pattern: `{organization}/{site}/{floor}/{equipment_id}/{data_type}`

Examples:
- `acme/building-a/floor-2/AHU-01/telemetry` - Sensor readings
- `acme/building-a/floor-2/AHU-01/metadata` - Equipment info updates
- `acme/building-a/floor-2/Chiller-01/control` - Control commands

### Directory Structure

```
src/
├── config/              # Environment config (InfluxDB, Memgraph, MQTT)
├── database/
│   ├── influxdb.client.ts      # InfluxDB connection & batch writer
│   ├── memgraph.client.ts      # Memgraph connection & Cypher helpers
│   └── graph-schema/           # Cypher files for schema initialization
│       ├── nodes.cypher        # CREATE constraints on Site, Equipment, etc.
│       ├── relationships.cypher # Relationship type definitions
│       └── indexes.cypher      # CREATE INDEX on frequently queried properties
├── models/
│   ├── graph-nodes.model.ts    # TypeScript interfaces for Memgraph nodes
│   ├── timeseries.model.ts     # InfluxDB Point structure
│   └── relationships.model.ts  # Graph relationship types
├── services/
│   ├── mqtt/
│   │   ├── mqtt-subscriber.service.ts  # MQTT client with reconnection
│   │   └── topic-router.service.ts     # Routes messages to storage services
│   ├── parsers/
│   │   ├── base-parser.interface.ts    # Parser contract
│   │   ├── vendor-factory.ts           # Selects parser based on vendor
│   │   └── vendors/                    # Tesla, CATL, LG, Generic parsers
│   ├── storage/
│   │   ├── influx-writer.service.ts    # Batches writes to InfluxDB
│   │   └── graph-manager.service.ts    # CRUD for Memgraph nodes/edges
│   ├── schema/
│   │   ├── entity-type-manager.service.ts     # Manage dynamic entity types
│   │   ├── entity-crud.service.ts             # CRUD for custom entities
│   │   ├── relationship-type-manager.service.ts  # Manage relationship types
│   │   └── relationship-crud.service.ts       # CRUD for custom relationships
│   └── api/
│       ├── server.ts                   # Express app with Apollo Server
│       └── graphql/
│           ├── schema.graphql          # GraphQL type definitions
│           ├── server.ts               # Apollo Server setup
│           ├── dataloaders.ts          # DataLoader for N+1 prevention
│           └── resolvers/
│               ├── query.ts            # Query resolvers (sites, equipment, metrics)
│               ├── mutation.ts         # Mutation resolvers (CRUD, dynamic schema)
│               └── types.ts            # Field resolvers (nested data)
├── types/              # Shared TypeScript types
└── utils/             # Logger (Winston), validators
```

## Key Architectural Decisions

### Vendor Parser Abstraction

Different BMS vendors (Tesla, CATL, LG) send different JSON structures. The parser layer normalizes these into a standard format:

```typescript
// Vendor-specific input → Standard output
interface NormalizedData {
  equipment_id: string;
  timestamp: Date;
  tags: { site, floor, zone, equipment, point, vendor };
  fields: { value, quality, status };
}
```

Parsers are selected by `vendor-factory.ts` based on MQTT topic or payload signature.

### Batch Write Strategy

MQTT can produce 1000+ messages/sec. Writing each individually would overwhelm databases.

**InfluxDB Writer** (`influx-writer.service.ts`):
- Buffers up to 1000 points
- Flushes every 1 second (whichever comes first)
- Uses InfluxDB batch write API
- Handles backpressure if database lags

**Memgraph Manager** (`graph-manager.service.ts`):
- Metadata changes are infrequent (vs metrics)
- Uses transactions for atomic updates
- Caches common queries (e.g., equipment lookup)

### GraphQL API & Combined Queries

The GraphQL API provides a unified interface that merges data from both databases:

**Example Query:**
```graphql
query GetEquipmentWithMetrics {
  equipment(id: "AHU-01") {
    id
    type
    vendor
    # From Memgraph
    zone {
      name
      floor {
        name
        site { name }
      }
    }
    controls {
      id
      type
    }
    # From InfluxDB
    latestMetrics {
      temperature
      humidity
      status
    }
    metricsHistory(start: "-1h", interval: "5m") {
      timestamp
      temperature
    }
  }
}
```

**Resolver Implementation:**
```typescript
// Type resolver for Equipment.latestMetrics
Equipment: {
  latestMetrics: async (equipment, args, context) => {
    // Query InfluxDB via DataLoader (prevents N+1)
    return context.dataloaders.metricsLoader.load(equipment.id);
  },

  controls: async (equipment, args, context) => {
    // Query Memgraph for CONTROLS relationships
    return context.memgraph.query(`
      MATCH (e:Equipment {id: $id})-[:CONTROLS]->(controlled)
      RETURN controlled
    `, { id: equipment.id });
  }
}
```

**Dynamic Entity Creation:**
```graphql
mutation DefineCustomSensor {
  defineEntityType(
    name: "TemperatureSensor"
    properties: [
      { name: "calibrationDate", type: "Date", required: true }
      { name: "accuracy", type: "Number", required: false }
    ]
  ) {
    name
    properties { name type required }
  }
}

mutation CreateCustomEntity {
  createEntity(
    entityType: "TemperatureSensor"
    properties: {
      id: "temp-sensor-01"
      calibrationDate: "2025-01-15"
      accuracy: 0.1
    }
  ) {
    id
    properties
  }
}
```

## Configuration

Copy `.env.example` to `.env` and update:

```bash
# InfluxDB - Primary timeseries storage
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=my-super-secret-auth-token  # From InfluxDB setup
INFLUXDB_ORG=bms-org
INFLUXDB_BUCKET=bms-metrics

# Memgraph - Graph database for relationships
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=                    # Optional
MEMGRAPH_PASSWORD=                # Optional

# MQTT - Message broker
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC_PATTERN=+/+/+/+/#     # Subscribe to all topics

# Batch write settings
BATCH_SIZE=1000                   # InfluxDB points per batch
BATCH_TIMEOUT_MS=1000            # Max wait before flush
```

## Docker Services

The `docker-compose.yml` defines:

1. **mosquitto** - MQTT broker (ports 1883, 9001)
2. **influxdb** - Timeseries DB (port 8086) with web UI
3. **memgraph** - Graph DB (port 7687) with Memgraph Lab UI (port 3000)
4. **bms-data-layer** - Node.js app (port 8080)

All services run on `bms-network` bridge network.

## Development Workflow

### Starting Fresh

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Start infrastructure
docker compose up -d mosquitto influxdb memgraph

# 3. Wait for InfluxDB to initialize (check logs)
docker compose logs -f influxdb

# 4. Get InfluxDB token from UI or logs, update .env

# 5. Install dependencies
npm install

# 6. Run app locally
npm run dev

# Or run everything in Docker
docker compose up -d
```

### Typical Development Cycle

1. Make code changes in `src/`
2. `nodemon` auto-restarts on file save (in dev mode)
3. Test MQTT flow: publish message → check InfluxDB/Memgraph
4. Query GraphQL API: Open http://localhost:8080/graphql (GraphQL Playground)
5. Run tests: `npm test`
6. Lint before commit: `npm run lint && npm run format`

**GraphQL Playground Example:**
```graphql
# Query sites with equipment and latest metrics
{
  sites {
    name
    floors {
      zones {
        equipment {
          id
          latestMetrics { temperature humidity }
        }
      }
    }
  }
}
```

## Testing Strategy

### Unit Tests (`tests/unit/`)
- **Parsers**: Test vendor-specific JSON → normalized data
- **InfluxDB client**: Mock InfluxDB, test Point creation
- **Memgraph client**: Mock driver, test Cypher query building
- **Utilities**: Logger, validators

### Integration Tests (`tests/integration/`)
- **MQTT → InfluxDB**: Publish MQTT → verify data in InfluxDB
- **MQTT → Memgraph**: Publish metadata → verify graph nodes
- **GraphQL API**: Test queries, mutations, and combined data fetching
- **Dynamic Schema**: Test entity/relationship type creation and usage

## Performance Considerations

### InfluxDB Optimization
- Tags are indexed automatically (use for filtering)
- Keep tag cardinality under 1M unique combinations
- Use downsampling tasks to reduce storage (1m, 5m, 1h aggregates)

### Memgraph Optimization
- In-memory: entire graph must fit in RAM
- Index frequently queried properties (equipment.id, site.type)
- Use LIMIT in queries to avoid returning massive graphs

### MQTT Optimization
- QoS 1 for guaranteed delivery without QoS 2 overhead
- Batch writes to databases (don't write every message individually)
- Handle backpressure: if DB is slow, buffer and pause MQTT consumption

## Common Queries

### InfluxDB (Flux)
```flux
// Latest values for all equipment on Floor 2
from(bucket: "bms-metrics")
  |> range(start: -1h)
  |> filter(fn: (r) => r.floor == "2" and r._field == "value")
  |> last()
  |> group(columns: ["equipment_id"])
```

### Memgraph (Cypher)
```cypher
// Get complete site hierarchy
MATCH path = (site:Site {id: 'site-01'})
             -[:HAS_FLOOR*]->(:Floor)
             -[:HAS_ZONE*]->(:Zone)
             -[:CONTAINS*]->(:Equipment)
RETURN path;

// Find what equipment Chiller-01 controls
MATCH (chiller:Equipment {id: 'Chiller-01'})-[:CONTROLS*1..3]->(controlled)
RETURN controlled.id, controlled.type;

// Get startup sequence for HVAC zone
MATCH path = (zone:Zone {id: 'hvac-a'})-[:CONTAINS]->(equip)
             -[:STARTS_BEFORE*0..]->(next)
RETURN equip.id, next.id, next.startup_order
ORDER BY next.startup_order;
```

## Troubleshooting

### InfluxDB not accepting writes
```bash
# Check InfluxDB health
curl http://localhost:8086/health

# Verify token
curl -H "Authorization: Token YOUR_TOKEN" http://localhost:8086/api/v2/buckets
```

### Memgraph connection issues
```bash
# Test Bolt connection
docker exec -it bms-memgraph mgconsole
# If fails, check logs: docker compose logs memgraph
```

### MQTT messages not arriving
```bash
# Subscribe to all topics
mosquitto_sub -h localhost -p 1883 -t '#' -v

# Check broker logs
docker compose logs mosquitto
```

## Schema Initialization

On first startup, the app should run graph schema initialization:

```typescript
// In src/index.ts startup sequence
await memgraph.initializeSchema([
  'graph-schema/nodes.cypher',      // Create constraints
  'graph-schema/relationships.cypher',
  'graph-schema/indexes.cypher'
]);
```

This creates uniqueness constraints and indexes in Memgraph.

## Entity-Component System with Brick Schema

The system uses an **Entity-Component System (ECS)** architecture with **Brick Schema** as the foundation for component types. This provides maximum flexibility through composition over inheritance.

### Why Entity-Component System?

**Traditional Inheritance Problems:**
- ❌ Deep hierarchies: Equipment → HVAC → AHU → CustomAHU
- ❌ Taxonomy debates: Is a hybrid unit HVAC or Electrical?
- ❌ Rigid structure: Can't mix traits from different branches
- ❌ Real-world doesn't follow strict hierarchies

**Entity-Component Benefits:**
- ✅ **Composition over inheritance**: Mix and match components
- ✅ **Flat structure**: No complex hierarchy to manage
- ✅ **Flexible**: Add/remove components dynamically at runtime
- ✅ **Real-world modeling**: Equipment can be HVAC + Electrical + Battery-powered
- ✅ **Brick compatible**: Brick classes become flat component types
- ✅ **No taxonomy debates**: Entities just have whatever components they need

### Why Brick Schema?

- **Industry Standard**: Widely adopted in building automation, IoT, and smart building domains
- **Rich Component Library**: 200+ equipment types, 80+ relationship types already defined
- **Predefined Relationships**: feeds, controls, hasPoint, hasPart, isLocationOf, etc.
- **Extensible**: Can create custom components alongside Brick components
- **Interoperability**: Compatible with other Brick-based systems

### Component Registry Architecture

**On Startup:**
1. Load Brick Schema ontology (`src/config/brick-schema.config.ts`)
2. **Flatten Brick classes to component types:**
   - Equipment → Equipment component
   - HVAC_Equipment → HVAC_Equipment component
   - AHU → AHU component
   - Temperature_Sensor → Temperature_Sensor component
   - (All Brick classes become independent, composable components)
3. Import Brick relationships with component requirements
4. All component types stored as `:ComponentType` meta-nodes in Memgraph
5. Users can create custom component types or compose existing ones via GraphQL

**Entity-Component Model:**
```
Entity: "ahu-01"
  ├─ Component: Equipment { id, name, manufacturer }
  ├─ Component: HVAC_Equipment { airflowType, capacity }
  ├─ Component: AHU { fanType, filterRating }
  └─ Component: BatteryBackup { batteryCapacity, runtime }
```

**Benefits:**
- **Standards-Based**: Use proven Brick component library
- **No Hierarchy Management**: Flat components, no parent/child complexity
- **Mix and Match**: Entity can be HVAC + Electrical + Battery simultaneously
- **Dynamic**: Add/remove components at runtime
- **Flexible Relationships**: Relationships check component requirements, not rigid types
- **Real-world Modeling**: Buildings have equipment that doesn't fit neat hierarchies

### Brick Schema Components (Pre-loaded)

The system comes with Brick Schema component types already registered (flattened, no hierarchy):

```graphql
query {
  # Query all available component types
  componentTypes {
    name
    properties { name type required }
  }
}

# Returns (flattened Brick components):
# - Equipment
# - HVAC_Equipment
# - AHU
# - VAV
# - Chiller
# - Boiler
# - Fan
# - Pump
# - Temperature_Sensor
# - Pressure_Sensor
# - etc. (200+ components from Brick Schema)
```

**Available Brick Components (Flat List):**
```
Equipment Components:
- Equipment
- HVAC_Equipment
- AHU
- VAV
- Chiller
- Boiler
- Cooling_Tower
- Fan
- Pump
- Lighting_Equipment
- Luminaire
- Safety_Equipment
- etc.

Point Components:
- Point
- Sensor
- Temperature_Sensor
- Pressure_Sensor
- Flow_Sensor
- Humidity_Sensor
- Setpoint
- Temperature_Setpoint
- Command
- Start_Stop_Command
- Speed_Command
- etc.
```

**No Hierarchy** - All are independent components that can be composed together!

### Creating Custom Components

You can create custom component types alongside Brick components:

```graphql
# Define a custom component
mutation {
  defineComponentType(
    name: "BatteryBackup"
    properties: [
      { name: "capacity", type: "Number", required: true }
      { name: "chemistry", type: "String", required: true }
      { name: "runtime", type: "Number", required: false }
    ]
  ) {
    name
    properties { name type required }
  }
}

# Define vendor-specific component
mutation {
  defineComponentType(
    name: "TeslaSpecific"
    properties: [
      { name: "solarIntegrated", type: "Boolean", required: false }
      { name: "powerwallConnected", type: "Boolean", required: false }
    ]
  )
}
```

### Brick Schema Relationships (Pre-loaded)

Brick Schema includes standard relationship types:

```graphql
query {
  relationshipTypes {
    name
    fromEntity
    toEntity
  }
}

# Returns Brick relationships:
# - feeds (Equipment → Equipment)
#   Example: Chiller feeds AHU
# - controls (Equipment → Point, Equipment → Equipment)
#   Example: Controller controls VAV
# - hasPoint (Equipment → Point)
#   Example: AHU hasPoint Temperature_Sensor
# - hasPart (Equipment → Equipment)
#   Example: AHU hasPart Fan
# - isLocationOf (Location → Equipment)
#   Example: Floor isLocationOf AHU
# - isPointOf (Point → Equipment)
#   Inverse of hasPoint
```

**Using Brick Relationships:**
```graphql
mutation {
  # Use Brick's 'feeds' relationship
  createRelationship(
    relationshipType: "feeds"
    fromId: "chiller-01"  # Chiller instance
    toId: "ahu-02"        # AHU instance
    properties: {}
  )
}

mutation {
  # Use Brick's 'hasPoint' relationship
  createRelationship(
    relationshipType: "hasPoint"
    fromId: "ahu-01"
    toId: "temp-sensor-101"
    properties: {}
  )
}
```

### Defining Custom Relationships

Extend Brick with custom relationships:

```graphql
mutation {
  defineRelationshipType(
    name: "poweredBy"  # Custom relationship
    fromEntity: "Equipment"
    toEntity: "BatteryPack"
    properties: [
      { name: "backupOnly", type: "Boolean", required: false }
    ]
  )
}
```

### Creating Entities with Components

Create entities by composing Brick and custom components:

```graphql
mutation {
  # Create an AHU entity with multiple components
  createEntity(
    id: "ahu-01"
    components: [
      {
        componentType: "Equipment"
        properties: {
          name: "Air Handling Unit 1"
          manufacturer: "Johnson Controls"
          model: "YVAA"
        }
      },
      {
        componentType: "HVAC_Equipment"
        properties: {
          airflowType: "variable"
          capacity: 50000
        }
      },
      {
        componentType: "AHU"
        properties: {
          fanType: "centrifugal"
          filterRating: "MERV-13"
        }
      }
    ]
  ) {
    id
    components {
      componentType
      properties
    }
  }
}

# Result:
{
  "id": "ahu-01",
  "components": [
    { "componentType": "Equipment", "properties": {...} },
    { "componentType": "HVAC_Equipment", "properties": {...} },
    { "componentType": "AHU", "properties": {...} }
  ]
}
```

### Hybrid Equipment Example

Create equipment that is both HVAC and Battery-powered:

```graphql
mutation {
  # Tesla hybrid HVAC unit with battery backup
  createEntity(
    id: "tesla-ahu-01"
    components: [
      {
        componentType: "Equipment"
        properties: { name: "Tesla Hybrid AHU", manufacturer: "Tesla" }
      },
      {
        componentType: "HVAC_Equipment"
        properties: { capacity: 60000 }
      },
      {
        componentType: "AHU"
        properties: { fanType: "EC motor" }
      },
      {
        componentType: "BatteryBackup"  # Custom component
        properties: { capacity: 100, chemistry: "LiFePO4", runtime: 4 }
      },
      {
        componentType: "TeslaSpecific"  # Custom component
        properties: { solarIntegrated: true, powerwallConnected: true }
      }
    ]
  )
}
```

**This entity is simultaneously:**
- Equipment ✓
- HVAC Equipment ✓
- AHU ✓
- Battery-backed ✓
- Tesla-specific ✓

**No inheritance hierarchy needed!**

### Dynamically Add/Remove Components

```graphql
# Add a component to an existing entity
mutation {
  addComponent(
    entityId: "ahu-01"
    componentType: "BatteryBackup"
    properties: {
      capacity: 50
      chemistry: "Li-ion"
      runtime: 2
    }
  ) {
    id
    components { componentType }
  }
}

# Remove a component
mutation {
  removeComponent(
    entityId: "ahu-01"
    componentType: "BatteryBackup"
  ) {
    id
    components { componentType }
  }
}
```

### Creating Custom Relationships

```graphql
mutation {
  createRelationship(
    relationshipType: "MONITORS"
    fromId: "sensor-temp-01"
    toId: "AHU-01"
    properties: {
      frequency: 5000
      alertThreshold: 85.0
    }
  ) {
    from { id }
    to { id }
    type
    properties
  }
}
```

### Querying Custom Entities

```graphql
query {
  queryEntities(
    entityType: "Sensor"
    filters: { model: "TH-200" }
  ) {
    id
    properties
    relationships {
      type
      target { id }
    }
  }
}
```

### Querying the Type Registry

Discover all available entity and relationship types:

```graphql
query {
  # Get all entity types (predefined + custom)
  entityTypes {
    name
    parentType
    properties {
      name
      type
      required
    }
    ownProperties {
      name
      type
      required
    }
  }

  # Get just predefined type names
  predefinedEntityTypes

  # Get all relationship types
  relationshipTypes {
    name
    fromEntity
    toEntity
    properties {
      name
      type
      required
    }
  }

  # Get predefined relationship names
  predefinedRelationshipTypes
}
```

**Example Response:**
```json
{
  "entityTypes": [
    {
      "name": "Site",
      "parentType": null,
      "properties": [
        { "name": "id", "type": "String", "required": true },
        { "name": "name", "type": "String", "required": true }
      ],
      "ownProperties": [
        { "name": "id", "type": "String", "required": true },
        { "name": "name", "type": "String", "required": true }
      ]
    },
    {
      "name": "Equipment",
      "parentType": null,
      "properties": [
        { "name": "id", "type": "String", "required": true },
        { "name": "type", "type": "String", "required": true }
      ],
      "ownProperties": [
        { "name": "id", "type": "String", "required": true },
        { "name": "type", "type": "String", "required": true }
      ]
    },
    {
      "name": "HVAC",
      "parentType": "Equipment",
      "properties": [
        { "name": "id", "type": "String", "required": true },
        { "name": "type", "type": "String", "required": true },
        { "name": "airflowRate", "type": "Number", "required": true }
      ],
      "ownProperties": [
        { "name": "airflowRate", "type": "Number", "required": true }
      ]
    }
  ],
  "predefinedEntityTypes": ["Site", "Floor", "Zone", "Equipment", "Point", "BatteryPack"],
  "relationshipTypes": [
    {
      "name": "HAS_FLOOR",
      "fromEntity": "Site",
      "toEntity": "Floor",
      "properties": []
    },
    {
      "name": "MONITORS",
      "fromEntity": "Sensor",
      "toEntity": "Equipment",
      "properties": [
        { "name": "frequency", "type": "Number", "required": false }
      ]
    }
  ],
  "predefinedRelationshipTypes": ["HAS_FLOOR", "HAS_ZONE", "CONTAINS", "HAS_POINT", "CONTROLS", "POWERS", "FEEDS"]
}
```

### Implementation Details

- **Unified Registry**: ALL types (predefined + custom) stored in Memgraph as meta-nodes
- **Meta-node Labels**: `:EntityType` for entity schemas, `:RelationshipType` for relationship schemas
- **Config-based Predefined Types**: Predefined types listed in `src/config/types.config.ts`, registered on startup
- **Type Inheritance**: EntityType nodes store `parentType` reference, properties are resolved recursively
- **Validation**: All entity/relationship instances validated against full type schema (including inherited properties)
- **Property Types**: Supported types are String, Number, Boolean, Date, JSON
- **Circular Inheritance Prevention**: System validates parent type exists and prevents circular references
- **Schema Evolution**: Types can be updated, but existing instances may require migration
- **Automatic Indexing**: Indexes created for all entity types (predefined + custom)
- **Introspection**: GraphQL queries discover all types, their inheritance chains, and schemas

**Storage Example in Memgraph:**
```cypher
// Predefined entity type (created on startup from config)
CREATE (:EntityType {
  name: 'Equipment',
  parentType: null,
  ownProperties: [
    {name: 'id', type: 'String', required: true},
    {name: 'type', type: 'String', required: true},
    {name: 'vendor', type: 'String', required: false}
  ]
})

// Custom entity type with inheritance (created via GraphQL mutation)
CREATE (:EntityType {
  name: 'HVAC',
  parentType: 'Equipment',  // Inherits from Equipment
  ownProperties: [
    {name: 'airflowRate', type: 'Number', required: true},
    {name: 'filterType', type: 'String', required: false}
  ]
})
// Effective properties for HVAC = Equipment.ownProperties + HVAC.ownProperties

// Further subtype
CREATE (:EntityType {
  name: 'AirHandler',
  parentType: 'HVAC',  // Inherits from HVAC (which inherits from Equipment)
  ownProperties: [
    {name: 'coolingCapacity', type: 'Number', required: true}
  ]
})
// Effective properties = Equipment + HVAC + AirHandler properties

// Predefined relationship type (created on startup from config)
CREATE (:RelationshipType {
  name: 'HAS_FLOOR',
  fromEntity: 'Site',
  toEntity: 'Floor',
  properties: []
})
```

**Type Inheritance Resolution:**
```typescript
// When validating an AirHandler entity:
function getEffectiveProperties(typeName: string): Property[] {
  const type = getEntityType(typeName);  // Get from registry
  const parentProps = type.parentType
    ? getEffectiveProperties(type.parentType)  // Recursive
    : [];
  return [...parentProps, ...type.ownProperties];
}

// Result for 'AirHandler':
// [
//   {name: 'id', type: 'String', required: true},        // from Equipment
//   {name: 'type', type: 'String', required: true},      // from Equipment
//   {name: 'vendor', type: 'String', required: false},   // from Equipment
//   {name: 'airflowRate', type: 'Number', required: true},  // from HVAC
//   {name: 'filterType', type: 'String', required: false},  // from HVAC
//   {name: 'coolingCapacity', type: 'Number', required: true} // from AirHandler
// ]
```

## Brick Schema Integration

### Getting the Brick Ontology

The Brick Schema ontology can be imported in several ways:

1. **Use Brick Schema npm package** (if available)
2. **Download Brick.ttl from GitHub**: https://github.com/BrickSchema/Brick
3. **Use Brick JSON-LD** representation for easier parsing in Node.js

### Implementation Approach

```typescript
// src/config/brick-schema.config.ts
import { BrickOntology } from './brick-ontology.json';

export const BRICK_CLASSES = {
  // Equipment hierarchy
  Equipment: { parent: null, properties: [...] },
  HVAC_Equipment: { parent: 'Equipment', properties: [...] },
  AHU: { parent: 'HVAC_Equipment', properties: [...] },
  VAV: { parent: 'HVAC_Equipment', properties: [...] },
  Chiller: { parent: 'HVAC_Equipment', properties: [...] },
  // ... etc

  // Point hierarchy
  Point: { parent: null, properties: [...] },
  Sensor: { parent: 'Point', properties: [...] },
  Temperature_Sensor: { parent: 'Sensor', properties: [...] },
  // ... etc
};

export const BRICK_RELATIONSHIPS = {
  feeds: { domain: 'Equipment', range: 'Equipment' },
  hasPoint: { domain: 'Equipment', range: 'Point' },
  controls: { domain: 'Equipment', range: ['Equipment', 'Point'] },
  // ... etc
};
```

### Brick Schema Resources

- **Official Site**: https://brickschema.org
- **GitHub**: https://github.com/BrickSchema/Brick
- **Documentation**: https://docs.brickschema.org
- **Viewer**: https://viewer.brickschema.org (explore class hierarchy)
- **Examples**: https://github.com/BrickSchema/Brick/tree/master/examples

## Important Notes

- **Brick Schema foundation**: Uses industry-standard Brick Schema for equipment types and relationships

- **No schema migrations for InfluxDB**: Tag/field structure is dynamic
- **Unified type registry**: ALL types (predefined + custom) stored as meta-nodes in Memgraph - no special cases
- **Config-based predefined types**: Predefined type names listed in `src/config/types.config.ts`, registered on startup
- **Type inheritance**: Subtypes extend parent properties - HVAC extends Equipment, AirHandler extends HVAC, etc.
- **Type introspection**: Query `entityTypes` to see all types with inheritance chains and full property lists
- **Consistent validation**: All entities validated against type registry (including inherited properties)
- **Dynamic schema extension**: Users can define custom entity types and relationships with inheritance via GraphQL mutations
- **Circular inheritance prevention**: System validates parent types exist and prevents circular references
- **Subtype polymorphism**: Relationships defined for Equipment work with HVAC, AirHandler, and other subtypes
- **Vendor parsers are critical**: Incorrect parsing = bad data in both DBs
- **GraphQL N+1 prevention**: Use DataLoader for batch loading to avoid N+1 query problems
- **GraphQL-only API**: No REST endpoints - all queries and mutations through GraphQL

## AI-Powered Capabilities

The WeStack BMS includes advanced AI capabilities for intelligent data integration, predictive analytics, and automated insights.

### AI Services Architecture

```
src/ai/
├── integration/          # AI-powered data integration
│   ├── source-discovery.service.ts
│   ├── schema-mapper.service.ts
│   └── data-quality.service.ts
├── analytics/           # Predictive analytics & anomaly detection
│   ├── prediction-engine.service.ts
│   ├── anomaly-detector.service.ts
│   └── pattern-analyzer.service.ts
├── nlp/                # Natural language processing
│   ├── query-parser.service.ts
│   ├── insight-generator.service.ts
│   └── claude-client.service.ts
└── models/             # ML model management
    ├── model-registry.service.ts
    └── feature-engineering.service.ts
```

### Key AI Features

**1. Natural Language Queries**
```graphql
query {
  nlQuery(
    question: "Show me all batteries overheating in Building A"
  ) {
    interpretation
    confidence
    generatedQuery
    results
    summary
    followUpQuestions
  }
}
```

**2. Predictive Maintenance**
```graphql
query {
  equipmentPredictions(
    siteId: "building-a"
    horizonDays: 30
    minProbability: 0.5
  ) {
    equipment { id type }
    failureProbability
    predictedFailureDate
    contributingFactors {
      name
      impact
      currentValue
    }
    recommendations {
      action
      priority
      estimatedSavings
    }
  }
}
```

**3. Anomaly Detection**
```graphql
subscription {
  anomalyDetected(
    severity: [HIGH, CRITICAL]
  ) {
    equipment { id location }
    anomaly {
      timestamp
      severity
      score
      explanation
    }
    recommendedActions {
      action
      urgency
    }
  }
}
```

**4. Automated Insights**
```graphql
query {
  insights(
    siteId: "building-a"
    period: LAST_7_DAYS
    categories: [ENERGY, MAINTENANCE, COST]
  ) {
    category
    title
    severity
    description
    rootCause {
      primary
      secondary
    }
    impact {
      costImpact
      energyWasted
    }
    recommendations {
      action
      estimatedSavings
      implementationEffort
    }
  }
}
```

**5. Smart Data Source Learning**
```graphql
mutation {
  learnDataSource(
    name: "New Vendor System"
    sampleData: """{"bat_id": "123", "v_cell": 3.65}"""
  ) {
    detectedSchema {
      fields {
        name
        type
        mapping {
          targetField
          confidence
        }
      }
    }
    suggestedParser {
      code
      confidence
    }
  }
}
```

### AI Configuration

Add to `.env`:
```bash
# AI Service Configuration
ANTHROPIC_API_KEY=your_claude_api_key
AI_MODEL=claude-sonnet-4.5
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=4096

# Feature Flags
ENABLE_AI_INSIGHTS=true
ENABLE_NL_QUERIES=true
ENABLE_ANOMALY_DETECTION=true
ENABLE_PREDICTIONS=true

# Performance Settings
AI_CACHE_TTL=3600
AI_BATCH_SIZE=100
```

### AI Dependencies

```bash
npm install @anthropic-ai/sdk@^0.30.0
npm install @tensorflow/tfjs-node@^4.15.0
npm install onnxruntime-node@^1.16.0
npm install ml-random-forest@^2.1.0
```

### AI Implementation Phases

**Phase 1**: Natural Language Query Interface (Week 1-2)
- Claude API integration
- GraphQL query generation
- Natural language summaries

**Phase 2**: Anomaly Detection (Week 3-4)
- Isolation Forest implementation
- Real-time monitoring
- Automated alerting

**Phase 3**: Predictive Analytics (Week 5-6)
- Equipment failure prediction
- Energy forecasting
- Maintenance optimization

**Phase 4**: Automated Insights (Week 7-8)
- Pattern recognition
- Cost optimization recommendations
- Root cause analysis

### AI Documentation

- **Architecture**: See `AI_INTEGRATION_PLAN.md`
- **Implementation Guide**: See `AI_IMPLEMENTATION_GUIDE.md`
- **API Reference**: GraphQL schema includes all AI types and queries

### AI ROI

- **Energy Savings**: 10-20% reduction → $10K-50K/year
- **Maintenance Optimization**: 15-30% cost reduction → $20K-100K/year
- **Downtime Prevention**: ~$50K-200K/year
- **Total ROI**: 500-2000% annually

### AI Cost Estimation

Monthly operating costs: $800-2800
- Claude API: $500-2000
- Compute: $200-500
- Storage: $50-100
- Weather API: $50-200
