# BMS Data Layer - Architecture & Design Decisions

## Project Overview

A vendor-neutral Building Management System (BMS) data layer that ingests real-time sensor data via MQTT, stores timeseries metrics in InfluxDB, maintains equipment relationships in Memgraph, and exposes everything through a flexible GraphQL API.

**Key Innovation:** Uses an Entity-Component System (ECS) architecture with Brick Schema components for maximum flexibility - equipment can compose any combination of components (HVAC + Electrical + Battery-powered) without rigid hierarchies.

---

## Tech Stack & Rationale

### 1. **Node.js + TypeScript**

**Why:**
- ✅ **Event-driven architecture**: Perfect for MQTT message handling (1000+ msgs/sec)
- ✅ **Async I/O**: Non-blocking database writes, MQTT subscriptions
- ✅ **Type safety**: TypeScript prevents runtime errors in complex data transformations
- ✅ **Rich ecosystem**: Excellent libraries for MQTT, InfluxDB, GraphQL, Memgraph
- ✅ **Developer productivity**: Fast iteration, hot-reload, familiar tooling

**Alternatives Considered:**
- Python: Good for data science, but slower async performance
- Go: Excellent performance, but smaller ecosystem and steeper learning curve
- Java: Enterprise-ready, but verbose and heavier runtime

**Decision:** Node.js + TypeScript for balance of performance, productivity, and ecosystem.

---

### 2. **InfluxDB (Timeseries Database)**

**Why:**
- ✅ **Purpose-built for timeseries**: Optimized for sensor data with timestamps
- ✅ **Tag-based model**: Efficient querying by equipment, site, floor, zone
- ✅ **High write throughput**: Handles 1M+ points/sec with batching
- ✅ **Automatic retention**: Built-in downsampling (raw → 1min → 5min → 1hr aggregates)
- ✅ **Flux query language**: Powerful time-based aggregations and transformations
- ✅ **No schema migrations**: Tag/field structure is dynamic

**Data Model Example:**
```javascript
{
  measurement: "equipment_metrics",
  tags: {
    site_id: "site-01",
    floor: "2",
    equipment_id: "AHU-01",
    point_id: "temp-sensor-01"
  },
  fields: {
    value: 72.5,
    quality: "good"
  },
  timestamp: "2025-12-27T10:00:00Z"
}
```

**Alternatives Considered:**
- PostgreSQL + TimescaleDB: Good, but less mature timeseries features
- Cassandra: Excellent scale, but operational complexity overkill
- MongoDB: Not optimized for timeseries queries

**Decision:** InfluxDB for specialized timeseries performance and features.

---

### 3. **Memgraph (Graph Database)**

**Why:**
- ✅ **In-memory performance**: Sub-millisecond graph queries (<1ms)
- ✅ **Graph-native**: Built for relationship traversals ("what controls what?")
- ✅ **Cypher query language**: Industry-standard graph queries (same as Neo4j)
- ✅ **Real-time critical**: Control sequences, impact analysis need fast responses
- ✅ **Bolt protocol**: Compatible with Neo4j drivers (neo4j-driver npm package)
- ✅ **Brick Schema compatible**: Brick is RDF/graph-based, maps naturally

**Use Cases:**
```cypher
// Find what Chiller-01 controls (relationship traversal)
MATCH (c:Entity {id: 'chiller-01'})-[:feeds*1..3]->(controlled)
RETURN controlled

// Startup sequence for HVAC zone (path queries)
MATCH path = (zone)-[:CONTAINS]->(equip)-[:STARTS_BEFORE*0..]->(next)
RETURN equip.id, next.id ORDER BY next.startup_order

// Impact analysis: what fails if AHU-01 fails? (graph traversal)
MATCH (ahu {id: 'ahu-01'})-[:feeds|controls*]->(affected)
RETURN affected
```

**Alternatives Considered:**
- Neo4j: Excellent, but disk-based (slower), expensive licensing
- PostgreSQL: Can do graphs, but not optimized for complex traversals
- No graph DB: Relationships in SQL become complex joins, poor performance

**Decision:** Memgraph for in-memory speed critical to real-time building control.

---

### 4. **Hybrid Database Architecture (InfluxDB + Memgraph)**

**Why Two Databases?**

| Aspect | InfluxDB | Memgraph |
|--------|----------|----------|
| **Data Type** | Timeseries metrics | Equipment relationships |
| **Write Pattern** | High-frequency (1000/sec) | Low-frequency (occasional) |
| **Query Pattern** | Time-range, aggregations | Graph traversals, paths |
| **Optimization** | Columnar, compressed | In-memory, indexed edges |
| **Use Case** | "What was temp at 3pm?" | "What does chiller control?" |

**Trade-offs:**
- ❌ **No ACID across databases**: Metrics and metadata written separately
  - ✅ **Why this is OK**: Metadata changes rarely, metrics flow independently
  - ✅ **Historical preservation**: If relationship changes, old metrics stay valid
  - ✅ **Eventual consistency**: Acceptable for BMS monitoring

- ❌ **Operational complexity**: Two databases to maintain
  - ✅ **Why this is OK**: Both have Docker images, simple deployment
  - ✅ **Clear separation**: Each DB does what it's best at
  - ✅ **Better performance**: Specialized DBs outperform general-purpose

**Alternative Approaches:**
- Single PostgreSQL: Simple, but poor timeseries and graph performance
- MongoDB: Flexible, but not optimized for either use case
- InfluxDB only: No graph queries, relationship modeling painful

**Decision:** Hybrid architecture - each database does what it's best at.

---

### 5. **GraphQL API (Apollo Server)**

**Why:**
- ✅ **Unified query interface**: Single endpoint combines InfluxDB + Memgraph data
- ✅ **Flexible queries**: Clients request exactly what they need
- ✅ **Type-safe**: Schema-first design with strong typing
- ✅ **Nested data fetching**: Perfect for equipment → metrics → relationships in one query
- ✅ **Introspection**: Self-documenting API, GraphQL Playground for exploration
- ✅ **N+1 prevention**: DataLoader batches and caches queries

**Example Query:**
```graphql
query {
  entity(id: "ahu-01") {
    id
    components { componentType properties }
    # From Memgraph
    relationships(type: "feeds") {
      target { id components }
    }
    # From InfluxDB
    metrics(start: "-1h") {
      timestamp
      temperature
      humidity
    }
  }
}
```

**Alternatives Considered:**
- REST API: Too many endpoints, over-fetching/under-fetching issues
- gRPC: Excellent performance, but less developer-friendly, no browser support
- Direct database access: No abstraction, clients coupled to DB schemas

**Decision:** GraphQL for flexible, type-safe querying across hybrid databases.

---

### 6. **MQTT (Eclipse Mosquitto)**

**Why:**
- ✅ **Industry standard**: De facto protocol for IoT/building automation
- ✅ **Pub/Sub model**: Decouples data producers (sensors) from consumers (our app)
- ✅ **QoS levels**: Quality of Service 1 for guaranteed delivery
- ✅ **Topic hierarchy**: Organized data routing (org/site/floor/equipment/data_type)
- ✅ **Lightweight**: Low overhead for high-frequency sensor data
- ✅ **Retained messages**: New subscribers get last known state

**Topic Pattern:**
```
{organization}/{site}/{floor}/{equipment_id}/{data_type}

Examples:
acme/building-a/floor-2/AHU-01/telemetry
acme/building-a/floor-2/AHU-01/metadata
acme/building-a/floor-2/Chiller-01/control
```

**Alternatives Considered:**
- HTTP polling: Inefficient, high latency, doesn't scale
- WebSockets: Good for bidirectional, but more complex than needed
- Apache Kafka: Excellent for high-scale, but operational overhead overkill
- RabbitMQ: Good message queue, but MQTT is more standard for IoT

**Decision:** MQTT for IoT industry standard and pub/sub efficiency.

---

### 7. **Entity-Component System (ECS) Architecture**

**Why:**

**Problem with Traditional Inheritance:**
```
❌ Equipment
   └── HVAC_Equipment
       └── AHU
           └── CustomAHU
               └── TeslaAHU
```

- Deep hierarchies hard to manage
- Can't have HVAC + Electrical equipment (single parent only)
- Taxonomy debates: "Is hybrid unit HVAC or Electrical?"
- Rigid structure doesn't match real buildings

**Solution: Entity-Component System:**
```
✅ Entity: "tesla-hybrid-01"
   Components:
   - Equipment { name, manufacturer }
   - HVAC_Equipment { capacity, airflow }
   - AHU { fanType, filterRating }
   - Electrical_Equipment { voltage, amperage }
   - BatteryBackup { capacity, runtime }
   - TeslaSpecific { solarIntegrated }
```

**Benefits:**
- ✅ **Composition over inheritance**: Mix any components
- ✅ **Flat structure**: No complex hierarchies
- ✅ **Dynamic**: Add/remove components at runtime
- ✅ **Real-world modeling**: Equipment is HVAC + Electrical + Battery simultaneously
- ✅ **No taxonomy debates**: Entity just has whatever components it needs

**Storage in Memgraph:**
```cypher
(:Entity {id: 'tesla-hybrid-01'})
  -[:HAS_COMPONENT]->(:Component {type: 'Equipment', props: {...}})
  -[:HAS_COMPONENT]->(:Component {type: 'HVAC_Equipment', props: {...}})
  -[:HAS_COMPONENT]->(:Component {type: 'BatteryBackup', props: {...}})
```

**Decision:** ECS for flexibility and real-world building modeling.

---

### 8. **Brick Schema (Building Ontology)**

**Why:**
- ✅ **Industry standard**: De facto ontology for smart buildings
- ✅ **Rich component library**: 200+ equipment types, 80+ relationships predefined
- ✅ **Graph-native**: Already designed as RDF/OWL ontology
- ✅ **Interoperability**: Compatible with other Brick-based systems
- ✅ **Community**: Active development, tools, examples
- ✅ **Proven**: Used by major building automation vendors

**How We Use It:**
1. Import Brick classes as **flat component types** (no hierarchy)
2. Equipment → Equipment component
3. HVAC_Equipment → HVAC_Equipment component
4. AHU → AHU component
5. Temperature_Sensor → Temperature_Sensor component

**Brick Components Available:**
- Equipment: HVAC_Equipment, AHU, VAV, Chiller, Boiler, Fan, Pump, etc.
- Points: Sensor, Temperature_Sensor, Pressure_Sensor, Flow_Sensor, etc.
- Relationships: feeds, controls, hasPoint, hasPart, isLocationOf, etc.

**Extensibility:**
- ✅ Can create **custom components** alongside Brick
- ✅ Can **compose** Brick components freely
- ✅ Can **extend** with vendor-specific components

**Alternatives Considered:**
- Project Haystack: Good, but tag-based (not graph-native)
- Custom schema: Reinventing the wheel, no interoperability
- IFC (Industry Foundation Classes): Too focused on building design, not operations

**Decision:** Brick Schema for industry-standard, graph-native building ontology.

---

## Architecture Principles

### 1. **Separation of Concerns**
- InfluxDB: Timeseries metrics only
- Memgraph: Equipment metadata and relationships only
- GraphQL: Combines both for unified API

### 2. **Composition over Inheritance**
- Entity-Component System for flexibility
- No rigid type hierarchies
- Mix components as needed

### 3. **Standards-Based**
- Brick Schema for equipment types
- MQTT for data ingestion
- GraphQL for API queries
- Cypher for graph queries

### 4. **Real-Time First**
- In-memory Memgraph for <1ms queries
- Batch writes to InfluxDB (1000 points/sec)
- Event-driven MQTT processing

### 5. **Developer Experience**
- GraphQL Playground for API exploration
- Type-safe TypeScript
- Memgraph Lab for graph visualization
- InfluxDB UI for timeseries exploration

### 6. **Extensibility**
- Custom component types
- Custom relationship types
- Dynamic component composition
- Generic JSON MQTT payloads

---

## Implementation Phases

### **Phase 1: Foundation ✅ COMPLETED**
- Project setup (Node.js, TypeScript, Docker)
- Dependencies (InfluxDB, Memgraph, MQTT clients)
- Configuration management

### **Phase 2: Database Clients & Models (CURRENT)**
- InfluxDB client with batch writes
- Memgraph client with Cypher helpers
- Brick Schema component loader
- TypeScript models for Entity-Component System
- Component type manager

### **Phase 3: MQTT Ingestion**
- MQTT subscriber with reconnection
- Topic router (org/site/floor/equipment/type)
- InfluxDB writer service (batching)
- Memgraph manager (entity/component CRUD)

### **Phase 4: GraphQL API**
- Schema definition (Entity, Component, ComponentType)
- Resolvers (Memgraph queries, InfluxDB queries)
- Mutations (createEntity, addComponent, defineComponentType)
- Apollo Server setup
- DataLoader for N+1 prevention

### **Phase 5: Testing**
- Unit tests (components, utilities, database clients)
- Integration tests (MQTT → InfluxDB/Memgraph → API)
- GraphQL tests (queries, mutations, composition)

### **Phase 6: Vendor-Specific Features (OPTIONAL)**
- Vendor parser interface
- Tesla/CATL/LG Chem parsers (only if needed)

---

## Design Decisions Summary

| Decision | Chosen Technology | Why |
|----------|------------------|-----|
| **Language** | Node.js + TypeScript | Event-driven, async I/O, type safety |
| **Timeseries DB** | InfluxDB | Purpose-built, 1M+ writes/sec, auto-retention |
| **Graph DB** | Memgraph | In-memory speed, Cypher, Brick-compatible |
| **API** | GraphQL (Apollo) | Flexible queries, type-safe, combines DBs |
| **Messaging** | MQTT (Mosquitto) | IoT standard, pub/sub, QoS |
| **Data Model** | Entity-Component System | Composition over inheritance, flexible |
| **Ontology** | Brick Schema | Industry standard, 200+ components, graph-native |
| **Architecture** | Hybrid (InfluxDB + Memgraph) | Each DB does what it's best at |

---

## Key Insights

1. **Two databases better than one**: Specialized databases (InfluxDB for timeseries, Memgraph for graphs) outperform general-purpose alternatives.

2. **ECS > Inheritance**: Real buildings have equipment that doesn't fit neat hierarchies. Composition is more flexible.

3. **Standards matter**: Using Brick Schema and MQTT means interoperability with industry tools.

4. **GraphQL unifies complexity**: Single API endpoint hides the complexity of querying two different databases.

5. **In-memory speed critical**: Building control decisions need <1ms graph queries. Memgraph delivers.

6. **Eventual consistency acceptable**: BMS doesn't need ACID across databases - metrics and metadata are independent.

7. **Vendor parsing optional**: Requiring standard JSON MQTT payloads is simpler than supporting every vendor format.

---

## Success Metrics

- ✅ **Performance**: <1ms graph queries, 1000+ MQTT msgs/sec
- ✅ **Flexibility**: Add/remove components dynamically
- ✅ **Scalability**: Handle thousands of equipment entities
- ✅ **Interoperability**: Compatible with Brick Schema tools
- ✅ **Developer Experience**: GraphQL Playground, type-safe API
- ✅ **Maintainability**: Clear separation of concerns, standards-based

---

## AI-Powered Capabilities (Optional)

### Overview

The BMS includes optional AI capabilities for intelligent data integration, predictive analytics, and automated insights. AI services are modular and can be enabled/disabled via feature flags.

### AI Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     AI-Powered BMS Layer                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  Natural Language│  │   Predictive     │  │   Automated  │  │
│  │  Query Interface │  │   Analytics      │  │   Insights   │  │
│  │  (Claude API)    │  │   Engine         │  │   Generator  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │
│           │                     │                    │           │
│  ┌────────▼─────────────────────▼────────────────────▼───────┐  │
│  │            AI Orchestration Service                        │  │
│  │  - Model Management                                        │  │
│  │  - Feature Engineering                                     │  │
│  │  - Context Management                                      │  │
│  └────────┬───────────────────┬────────────────────┬──────────┘  │
│           │                   │                    │              │
└───────────┼───────────────────┼────────────────────┼──────────────┘
            │                   │                    │
            ▼                   ▼                    ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Data Sources   │  │  Hybrid Database  │  │  ML Model Store  │
│  Integration    │  │  (InfluxDB +      │  │  (Model Registry)│
│  - MQTT         │  │   Memgraph)       │  │  - TensorFlow    │
│  - REST APIs    │  │                   │  │  - PyTorch       │
│  - CSV/Excel    │  │  - Timeseries     │  │  - ONNX          │
│  - Vendor APIs  │  │  - Graph Data     │  │                  │
└─────────────────┘  └──────────────────┘  └──────────────────┘
```

### AI Services Directory Structure

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

### AI Feature 1: Natural Language Queries

**Purpose**: Allow users to query BMS data using plain English instead of GraphQL.

**Implementation**:
- Claude API integration for NL understanding
- GraphQL query generation
- Result summarization
- Conversational follow-ups

**Example**:
```
User: "Show me all batteries with temperature above 40 degrees"
AI:   Generates GraphQL, executes, returns results with summary
```

**GraphQL Integration**:
```graphql
query {
  nlQuery(question: "Show me all batteries overheating") {
    interpretation
    confidence
    generatedQuery
    results
    summary
    followUpQuestions
  }
}
```

**Technical Stack**:
- Claude API (Anthropic)
- GraphQL schema parsing
- Prompt engineering templates

**ROI**: Immediate user value, reduces learning curve

---

### AI Feature 2: Predictive Maintenance

**Purpose**: Predict equipment failures before they happen.

**Implementation**:
- Feature engineering from timeseries + graph data
- Gradient Boosted Trees (XGBoost) for predictions
- 30-day failure forecasting
- Root cause analysis

**Features Used**:
- Operating hours
- Temperature trends (7d, 30d moving average)
- Vibration levels
- Energy consumption patterns
- Maintenance history
- Equipment age
- Seasonal factors

**GraphQL Integration**:
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

**Technical Stack**:
- TensorFlow.js for in-process ML
- Feature engineering pipeline
- Model registry with versioning

**ROI**: $20K-100K/year in maintenance cost savings

---

### AI Feature 3: Anomaly Detection

**Purpose**: Real-time detection of equipment anomalies.

**Implementation**:
- Isolation Forest for point anomalies
- LSTM Autoencoder for sequence anomalies
- Multi-variate analysis
- Automated alerting

**Algorithm**: Hybrid approach
```
Anomaly Score = Ensemble(
  IsolationForest(current_point),
  LSTM_Autoencoder(time_window)
)
```

**GraphQL Subscription**:
```graphql
subscription {
  anomalyDetected(severity: [HIGH, CRITICAL]) {
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

**Technical Stack**:
- Isolation Forest (ml-random-forest)
- TensorFlow.js LSTM
- Real-time monitoring pipeline

**ROI**: Prevent critical failures, reduce downtime

---

### AI Feature 4: Automated Insights

**Purpose**: Generate weekly optimization recommendations.

**Implementation**:
- Pattern recognition in energy consumption
- Cost optimization analysis
- Performance trending
- AI-generated natural language insights

**Categories**:
- Energy efficiency
- Equipment health
- Cost optimization
- Anomaly patterns

**GraphQL Integration**:
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

**Technical Stack**:
- Claude API for insight generation
- Statistical analysis
- Time-series pattern recognition

**ROI**: $10K-50K/year in energy savings

---

### AI Feature 5: Smart Data Integration

**Purpose**: Automatically learn new vendor data formats.

**Implementation**:
- Auto-detect schema from sample data
- AI-powered field mapping
- Semantic understanding of vendor formats
- Automated parser generation

**GraphQL Integration**:
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

**Technical Stack**:
- Claude API for semantic understanding
- Schema inference algorithms
- Parser template generation

**ROI**: 15 minutes vs 4 hours for new vendor integration

---

### AI Configuration

Environment variables in `.env`:

```bash
# AI Service Configuration
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
AI_MODEL=claude-sonnet-4.5
AI_TEMPERATURE=0.2
AI_MAX_TOKENS=4096

# Feature Flags
ENABLE_AI_INSIGHTS=false
ENABLE_NL_QUERIES=false
ENABLE_ANOMALY_DETECTION=false
ENABLE_PREDICTIONS=false

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

**Phase 1**: Natural Language Queries (Week 1-2)
- Claude API integration
- GraphQL query generation
- Result summarization

**Phase 2**: Anomaly Detection (Week 3-4)
- Isolation Forest implementation
- Real-time monitoring
- Automated alerting

**Phase 3**: Automated Insights (Week 5-6)
- Pattern recognition
- Cost optimization
- Weekly report generation

**Phase 4**: Predictive Maintenance (Week 7-9)
- Feature engineering
- Model training
- Prediction engine
- Recommendation system

**Phase 5**: Smart Data Integration (Week 10-11)
- Schema detection
- Field mapping
- Parser generation

### AI Cost & ROI

**Monthly Operating Costs**: $750-2,600
- Claude API: $500-2,000
- Compute: $200-500
- Storage: $50-100

**Annual Returns**: $80,000-350,000
- Energy optimization: $10K-50K
- Maintenance savings: $20K-100K
- Downtime prevention: $50K-200K

**First Year ROI**: 400-2000% 🚀

---

### AI Design Principles

1. **Modular**: Each AI feature is independent, can be enabled/disabled
2. **Cost-Effective**: Cache expensive AI calls, batch processing
3. **Explainable**: All AI decisions include explanations
4. **Fail-Safe**: System works without AI if disabled/unavailable
5. **Privacy-First**: No sensitive data sent to external APIs without consent

---

### Current AI Status

**Designed**: ✅ Complete architecture
**Documented**: ✅ Implementation guides ready
**Dependencies**: ✅ Available for installation
**Implementation**: ⏳ Pending (optional feature)

---

**Last Updated:** December 27, 2025
**Status:** Phase 2 - Database Clients & Models (In Progress) + AI Architecture Designed
