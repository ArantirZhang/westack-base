import { createServer } from './services/api/server';
import { initMemgraph } from './database/memgraph.client';
import { initInfluxDB } from './database/influxdb.client';
import { initMemgraphSchema } from './database/init-schema.service';
import { BrickSchemaLoader } from './services/schema/brick-loader.service';
import { ComponentTypeManager } from './services/schema/component-type-manager.service';
import { RelationshipTypeManager } from './services/schema/relationship-type-manager.service';
import { logConfig } from './config/environment';

async function main() {
  try {
    console.log('🚀 Starting WeStack BMS Server with ECS + Brick Schema...');
    console.log('');

    // Log configuration
    logConfig();
    console.log('');

    // Initialize databases
    console.log('📊 Initializing databases...');

    try {
      await initMemgraph();
    } catch (error) {
      console.warn('⚠️  Memgraph connection failed (will retry on queries):', (error as Error).message);
    }

    try {
      initInfluxDB();
    } catch (error) {
      console.warn('⚠️  InfluxDB connection failed (will retry on queries):', (error as Error).message);
    }

    console.log('');

    // Initialize Memgraph schema (constraints, indexes)
    try {
      await initMemgraphSchema();
    } catch (error) {
      console.warn('⚠️  Schema initialization failed:', (error as Error).message);
    }

    console.log('');

    // Load Brick Schema component types
    console.log('📚 Loading Brick Schema component types...');
    try {
      const componentTypeManager = new ComponentTypeManager();
      const relationshipTypeManager = new RelationshipTypeManager();
      const brickLoader = new BrickSchemaLoader(componentTypeManager, relationshipTypeManager);
      await brickLoader.loadBrickSchema();
    } catch (error) {
      console.warn('⚠️  Brick Schema loading failed:', (error as Error).message);
    }

    console.log('');

    // Start GraphQL server
    const { url } = await createServer();

    console.log('✅ WeStack BMS Server Started Successfully!');
    console.log(`📡 GraphQL endpoint: ${url}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('');
    console.log('📝 Test queries:');
    console.log(`   curl -X POST ${url} -H "Content-Type: application/json" -d '{"query":"{ hello }"}'`);
    console.log(`   curl -X POST ${url} -H "Content-Type: application/json" -d '{"query":"{ databaseHealth { overall } }"}'`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
