import { createServer } from './services/api/server';

async function main() {
  try {
    console.log('🚀 Starting WeStack BMS Server...');

    const { url } = await createServer();

    console.log('✅ WeStack BMS Server Started Successfully!');
    console.log(`📡 GraphQL endpoint: ${url}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📝 Try: curl ${url}?query={hello}`);
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

main();
