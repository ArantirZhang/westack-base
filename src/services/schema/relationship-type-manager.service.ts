/**
 * Relationship Type Manager Service
 *
 * Manages the registry of relationship types (both Brick Schema and custom).
 * Relationship types are stored as :RelationshipType meta-nodes in Memgraph.
 */

import { getMemgraphClient } from '../../database/memgraph.client';
import { RelationshipType, PropertyDefinition } from '../../models/ecs.model';

export class RelationshipTypeManager {
  private memgraph = getMemgraphClient();

  /**
   * Register a relationship type
   * Stored as :RelationshipType meta-node in Memgraph
   */
  async registerRelationshipType(data: {
    name: string;
    fromEntity: string;
    toEntity: string;
    properties: PropertyDefinition[];
    description?: string;
  }): Promise<void> {
    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MERGE (rt:RelationshipType {name: $name})
        SET rt.fromEntity = $fromEntity,
            rt.toEntity = $toEntity,
            rt.properties = $properties,
            rt.description = $description,
            rt.updatedAt = timestamp()
        `,
        {
          name: data.name,
          fromEntity: data.fromEntity,
          toEntity: data.toEntity,
          properties: JSON.stringify(data.properties),
          description: data.description || null,
        }
      );
    });
  }

  /**
   * Get a relationship type by name
   */
  async getRelationshipType(name: string): Promise<RelationshipType | null> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType {name: $name})
        RETURN rt
        `,
        { name }
      );
    });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get('rt');
    return this.mapToRelationshipType(node.properties);
  }

  /**
   * Get all relationship types
   */
  async getAllRelationshipTypes(): Promise<RelationshipType[]> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType)
        RETURN rt
        ORDER BY rt.name
        `
      );
    });

    return result.records.map((record: any) =>
      this.mapToRelationshipType(record.get('rt').properties)
    );
  }


  /**
   * Check if a relationship type exists
   */
  async exists(name: string): Promise<boolean> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType {name: $name})
        RETURN count(rt) as count
        `,
        { name }
      );
    });

    return result.records[0].get('count').toNumber() > 0;
  }

  /**
   * Delete a relationship type
   */
  async deleteRelationshipType(name: string): Promise<void> {
    const relType = await this.getRelationshipType(name);

    if (!relType) {
      throw new Error(`Relationship type '${name}' not found`);
    }

    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MATCH (rt:RelationshipType {name: $name})
        DELETE rt
        `,
        { name }
      );
    });
  }

  /**
   * Get count of relationship types
   */
  async getCount(): Promise<number> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType)
        RETURN count(rt) as total
        `
      );
    });

    return result.records[0].get('total').toNumber();
  }

  /**
   * Map Memgraph node properties to RelationshipType
   */
  private mapToRelationshipType(props: any): RelationshipType {
    return {
      name: props.name,
      fromEntity: props.fromEntity,
      toEntity: props.toEntity,
      properties: typeof props.properties === 'string'
        ? JSON.parse(props.properties)
        : props.properties,
      description: props.description,
    };
  }
}
