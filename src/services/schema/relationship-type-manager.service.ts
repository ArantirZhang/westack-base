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
   * Register a relationship type (Brick Schema or custom)
   * Stored as :RelationshipType meta-node in Memgraph
   */
  async registerRelationshipType(data: {
    name: string;
    fromEntity: string;
    toEntity: string;
    properties: PropertyDefinition[];
    isBrickSchema: boolean;
    description?: string;
  }): Promise<void> {
    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MERGE (rt:RelationshipType {name: $name})
        SET rt.fromEntity = $fromEntity,
            rt.toEntity = $toEntity,
            rt.properties = $properties,
            rt.isBrickSchema = $isBrickSchema,
            rt.description = $description,
            rt.updatedAt = datetime()
        `,
        {
          name: data.name,
          fromEntity: data.fromEntity,
          toEntity: data.toEntity,
          properties: JSON.stringify(data.properties),
          isBrickSchema: data.isBrickSchema,
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
   * Get Brick Schema relationship types only
   */
  async getBrickRelationshipTypes(): Promise<RelationshipType[]> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType)
        WHERE rt.isBrickSchema = true
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
   * Get custom (user-defined) relationship types only
   */
  async getCustomRelationshipTypes(): Promise<RelationshipType[]> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType)
        WHERE rt.isBrickSchema = false
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
   * Delete a relationship type (only custom types)
   */
  async deleteRelationshipType(name: string): Promise<void> {
    const relType = await this.getRelationshipType(name);

    if (!relType) {
      throw new Error(`Relationship type '${name}' not found`);
    }

    if (relType.isBrickSchema) {
      throw new Error(`Cannot delete Brick Schema relationship type '${name}'`);
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
  async getCount(): Promise<{ total: number; brick: number; custom: number }> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (rt:RelationshipType)
        RETURN
          count(rt) as total,
          count(CASE WHEN rt.isBrickSchema = true THEN 1 END) as brick,
          count(CASE WHEN rt.isBrickSchema = false THEN 1 END) as custom
        `
      );
    });

    const record = result.records[0];
    return {
      total: record.get('total').toNumber(),
      brick: record.get('brick').toNumber(),
      custom: record.get('custom').toNumber(),
    };
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
      isBrickSchema: props.isBrickSchema,
      description: props.description,
    };
  }
}
