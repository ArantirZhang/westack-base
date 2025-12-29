import { createServer } from './services/api/server';
import { initMemgraph } from './database/memgraph.client';
import { initInfluxDB } from './database/influxdb.client';
import { logConfig } from './config/environment';

async function main() {
  try {
    console.log('🚀 Starting WeStack BMS Server...');
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
