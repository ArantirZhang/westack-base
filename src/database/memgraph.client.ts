import neo4j, { Driver, Session } from 'neo4j-driver';

/**
 * Memgraph Database Client using Neo4j Driver v6
 *
 * Uses the new transaction API patterns introduced in Neo4j driver v6:
 * - executeRead() for read transactions
 * - executeWrite() for write transactions
 * - Improved connection pooling and session management
 */
export class MemgraphClient {
  private driver: Driver | null = null;
  private uri: string;
  private username: string;
  private password: string;

  constructor(
    uri: string = process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
    username: string = process.env.MEMGRAPH_USER || '',
    password: string = process.env.MEMGRAPH_PASSWORD || ''
  ) {
    this.uri = uri;
    this.username = username;
    this.password = password;
  }

  /**
   * Connect to Memgraph database
   */
  async connect(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.uri,
        this.username ? neo4j.auth.basic(this.username, this.password) : neo4j.auth.basic('', ''),
        {
          encrypted: false,  // Memgraph typically runs without encryption in development
          maxConnectionPoolSize: 50,
          connectionTimeout: 5000
        }
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      console.log('✅ Connected to Memgraph database');
    } catch (error) {
      console.error('❌ Failed to connect to Memgraph:', error);
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
      console.log('🔌 Disconnected from Memgraph');
    }
  }

  /**
   * Get a new session (Neo4j driver v6 pattern)
   */
  getSession(): Session {
    if (!this.driver) {
      throw new Error('Driver not initialized. Call connect() first.');
    }
    return this.driver.session();
  }

  /**
   * Execute a read query using Neo4j v6 executeRead pattern
   * Recommended for SELECT/MATCH queries
   */
  async executeRead<T>(
    query: string,
    parameters: Record<string, any> = {}
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.executeRead(tx =>
        tx.run(query, parameters)
      );

      return result.records.map(record => record.toObject() as T);
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a write query using Neo4j v6 executeWrite pattern
   * Recommended for CREATE/UPDATE/DELETE queries
   */
  async executeWrite<T>(
    query: string,
    parameters: Record<string, any> = {}
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.executeWrite(tx =>
        tx.run(query, parameters)
      );

      return result.records.map(record => record.toObject() as T);
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a query and return a single result
   */
  async executeReadSingle<T>(
    query: string,
    parameters: Record<string, any> = {}
  ): Promise<T | null> {
    const results = await this.executeRead<T>(query, parameters);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Execute a query and return a single result (write transaction)
   */
  async executeWriteSingle<T>(
    query: string,
    parameters: Record<string, any> = {}
  ): Promise<T | null> {
    const results = await this.executeWrite<T>(query, parameters);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Check if database is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.executeRead<{ health: number }>(
        'RETURN 1 as health'
      );
      return result.length > 0 && result[0].health === 1;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    nodeCount: number;
    relationshipCount: number;
    labels: string[];
  }> {
    const session = this.getSession();
    try {
      // Count nodes
      const nodeResult = await session.executeRead(tx =>
        tx.run('MATCH (n) RETURN count(n) as count')
      );
      const nodeCount = nodeResult.records[0]?.get('count').toNumber() || 0;

      // Count relationships
      const relResult = await session.executeRead(tx =>
        tx.run('MATCH ()-[r]->() RETURN count(r) as count')
      );
      const relationshipCount = relResult.records[0]?.get('count').toNumber() || 0;

      // Get labels
      const labelResult = await session.executeRead(tx =>
        tx.run('CALL db.labels()')
      );
      const labels = labelResult.records.map(r => r.get(0) as string);

      return { nodeCount, relationshipCount, labels };
    } finally {
      await session.close();
    }
  }
}

// Singleton instance
let memgraphClient: MemgraphClient | null = null;

/**
 * Get or create the Memgraph client singleton
 */
export function getMemgraphClient(): MemgraphClient {
  if (!memgraphClient) {
    memgraphClient = new MemgraphClient();
  }
  return memgraphClient;
}

/**
 * Initialize and connect to Memgraph
 */
export async function initMemgraph(): Promise<MemgraphClient> {
  const client = getMemgraphClient();
  await client.connect();
  return client;
}
