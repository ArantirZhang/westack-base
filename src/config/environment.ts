import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

/**
 * Environment configuration schema validation
 */
const envSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(8080),

  // InfluxDB
  INFLUXDB_URL: Joi.string().uri().default('http://localhost:8086'),
  INFLUXDB_TOKEN: Joi.string().default(''),
  INFLUXDB_ORG: Joi.string().default('bms-org'),
  INFLUXDB_BUCKET: Joi.string().default('bms-metrics'),

  // Memgraph/Neo4j
  MEMGRAPH_URI: Joi.string().default('bolt://localhost:7687'),
  MEMGRAPH_USER: Joi.string().allow('').default(''),
  MEMGRAPH_PASSWORD: Joi.string().allow('').default(''),

  // MQTT
  MQTT_BROKER_URL: Joi.string().uri().default('mqtt://localhost:1883'),
  MQTT_TOPIC_PATTERN: Joi.string().default('+/+/+/+/#'),

  // AI Features (Optional)
  ANTHROPIC_API_KEY: Joi.string().allow('').optional(),
  ENABLE_AI_INSIGHTS: Joi.boolean().default(false),
  ENABLE_NL_QUERIES: Joi.boolean().default(false),
  ENABLE_ANOMALY_DETECTION: Joi.boolean().default(false),
}).unknown(true);

/**
 * Validate and extract environment configuration
 */
const { error, value: env } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Environment validation error: ${error.message}`);
}

/**
 * Typed environment configuration
 */
export const config = {
  // Application
  nodeEnv: env.NODE_ENV as string,
  port: env.PORT as number,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  // InfluxDB
  influxdb: {
    url: env.INFLUXDB_URL as string,
    token: env.INFLUXDB_TOKEN as string,
    org: env.INFLUXDB_ORG as string,
    bucket: env.INFLUXDB_BUCKET as string,
  },

  // Memgraph
  memgraph: {
    uri: env.MEMGRAPH_URI as string,
    user: env.MEMGRAPH_USER as string,
    password: env.MEMGRAPH_PASSWORD as string,
  },

  // MQTT
  mqtt: {
    brokerUrl: env.MQTT_BROKER_URL as string,
    topicPattern: env.MQTT_TOPIC_PATTERN as string,
  },

  // AI Features
  ai: {
    anthropicApiKey: env.ANTHROPIC_API_KEY as string | undefined,
    enableInsights: env.ENABLE_AI_INSIGHTS as boolean,
    enableNLQueries: env.ENABLE_NL_QUERIES as boolean,
    enableAnomalyDetection: env.ENABLE_ANOMALY_DETECTION as boolean,
  },
};

/**
 * Log configuration on startup (hide sensitive data)
 */
export function logConfig(): void {
  console.log('📋 Configuration:');
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   InfluxDB: ${config.influxdb.url}`);
  console.log(`   Memgraph: ${config.memgraph.uri}`);
  console.log(`   MQTT: ${config.mqtt.brokerUrl}`);
  console.log(`   AI Features: ${config.ai.enableNLQueries || config.ai.enableInsights || config.ai.enableAnomalyDetection ? 'Enabled' : 'Disabled'}`);
}
