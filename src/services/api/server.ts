import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolvers } from './graphql/resolvers';

// Load GraphQL schema from file
const typeDefs = readFileSync(
  join(__dirname, 'graphql', 'schema.graphql'),
  'utf-8'
);

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
