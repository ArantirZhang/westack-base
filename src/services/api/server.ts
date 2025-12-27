import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { getMemgraphClient } from '../../database/memgraph.client';
import { getInfluxDBClient } from '../../database/influxdb.client';

const typeDefs = `#graphql
  type Query {
    hello: String!
    health: String!
    version: String!
    systemInfo: SystemInfo!
    databaseHealth: DatabaseHealth!
  }

  type SystemInfo {
    status: String!
    timestamp: String!
    version: String!
    uptime: Float!
  }

  type DatabaseHealth {
    memgraph: DatabaseStatus!
    influxdb: DatabaseStatus!
    overall: String!
  }

  type DatabaseStatus {
    connected: Boolean!
    healthy: Boolean!
    message: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello from WeStack BMS!',
    health: () => 'OK',
    version: () => '1.0.0',
    systemInfo: () => ({
      status: 'operational',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime()
    }),
    databaseHealth: async () => {
      const memgraph = getMemgraphClient();
      const influxdb = getInfluxDBClient();

      let memgraphHealthy = false;
      let influxdbHealthy = false;

      try {
        memgraphHealthy = await memgraph.healthCheck();
      } catch (error) {
        console.error('Memgraph health check error:', error);
      }

      try {
        influxdbHealthy = await influxdb.healthCheck();
      } catch (error) {
        console.error('InfluxDB health check error:', error);
      }

      const overall = memgraphHealthy && influxdbHealthy ? 'healthy' : 'degraded';

      return {
        memgraph: {
          connected: true,
          healthy: memgraphHealthy,
          message: memgraphHealthy ? 'Connected and responsive' : 'Connection issues'
        },
        influxdb: {
          connected: true,
          healthy: influxdbHealthy,
          message: influxdbHealthy ? 'Connected and responsive' : 'Connection issues'
        },
        overall
      };
    }
  }
};

export async function createServer() {
  // Create Apollo Server v4 instance
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  // Start server using standalone mode (includes Express under the hood)
  const { url } = await startStandaloneServer(server, {
    listen: { port: Number(process.env.PORT) || 8080 },
  });

  return { server, url };
}
