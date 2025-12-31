/**
 * Memgraph Schema Initialization Service
 *
 * Runs Cypher scripts to create constraints and indexes
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { getMemgraphClient } from './memgraph.client';

export class SchemaInitializer {
  private memgraph = getMemgraphClient();

  /**
   * Initialize Memgraph schema with constraints and indexes
   */
  async initializeSchema(): Promise<void> {
    console.log('🔧 Initializing Memgraph schema...');

    try {
      // Run constraints
      await this.runCypherFile('constraints.cypher');

      // Run indexes
      await this.runCypherFile('indexes.cypher');

      console.log('✅ Memgraph schema initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Memgraph schema:', error);
      throw error;
    }
  }

  /**
   * Run a Cypher file
   */
  private async runCypherFile(filename: string): Promise<void> {
    const filePath = join(__dirname, 'graph-schema', filename);
    const cypherContent = readFileSync(filePath, 'utf-8');

    // Split by semicolon and filter out empty lines and comments
    const statements = cypherContent
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`📄 Running ${filename}...`);

    for (const statement of statements) {
      try {
        await this.memgraph.executeWrite(statement, {});
        console.log(`  ✓ ${statement.substring(0, 60)}...`);
      } catch (error: any) {
        // Ignore errors for constraints/indexes that already exist
        if (
          error.message?.includes('already exists') ||
          error.message?.includes('Constraint already exists')
        ) {
          console.log(`  ⊙ Already exists: ${statement.substring(0, 60)}...`);
        } else {
          console.error(`  ✗ Failed: ${statement}`);
          console.error(`    Error: ${error.message}`);
          throw error;
        }
      }
    }
  }

  /**
   * Drop all constraints and indexes (for testing/reset)
   */
  async dropSchema(): Promise<void> {
    console.log('🔧 Dropping Memgraph schema...');

    try {
      // Drop all constraints
      const constraints = await this.memgraph.executeRead(
        'SHOW CONSTRAINT INFO',
        {}
      );

      for (const constraint of constraints) {
        const constraintName = (constraint as any).name;
        await this.memgraph.executeWrite(`DROP CONSTRAINT ${constraintName}`, {});
        console.log(`  ✓ Dropped constraint: ${constraintName}`);
      }

      console.log('✅ Memgraph schema dropped');
    } catch (error) {
      console.error('❌ Failed to drop Memgraph schema:', error);
      throw error;
    }
  }
}

/**
 * Initialize Memgraph schema (called during startup)
 */
export async function initMemgraphSchema(): Promise<void> {
  const initializer = new SchemaInitializer();
  await initializer.initializeSchema();
}

/**
 * Drop Memgraph schema (for testing/reset)
 */
export async function dropMemgraphSchema(): Promise<void> {
  const initializer = new SchemaInitializer();
  await initializer.dropSchema();
}
