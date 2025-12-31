/**
 * Entity Manager Service
 *
 * Core CRUD operations for entities in the Entity-Component System.
 * Entities are stored in Memgraph with their components.
 */

import { getMemgraphClient } from '../../database/memgraph.client';
import { ComponentTypeManager } from '../schema/component-type-manager.service';
import {
  Entity,
  ComponentInput,
  CreateEntityInput,
  Relationship,
} from '../../models/ecs.model';

export class EntityManager {
  private memgraph = getMemgraphClient();

  constructor(private componentTypeManager: ComponentTypeManager) {}

  /**
   * Create a new entity with components
   */
  async createEntity(input: CreateEntityInput): Promise<Entity> {
    // Validate all components
    await this.validateComponents(input.components);

    await this.memgraph.executeWriteTx(async (tx) => {
      // Create :Entity node
      await tx.run(
        `
        CREATE (e:Entity {
          id: $id,
          createdAt: timestamp(),
          updatedAt: timestamp()
        })
        `,
        { id: input.id }
      );

      // Create component nodes and relationships
      for (const component of input.components) {
        await tx.run(
          `
          MATCH (e:Entity {id: $entityId})
          CREATE (c:Component {
            type: $componentType,
            properties: $properties
          })
          CREATE (e)-[:HAS_COMPONENT]->(c)
          `,
          {
            entityId: input.id,
            componentType: component.componentType,
            properties: JSON.stringify(component.properties),
          }
        );
      }
    });

    const entity = await this.getEntity(input.id);
    if (!entity) {
      throw new Error(`Failed to create entity ${input.id}`);
    }

    return entity;
  }

  /**
   * Get entity by ID with all components
   */
  async getEntity(id: string): Promise<Entity | null> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (e:Entity {id: $id})
        OPTIONAL MATCH (e)-[:HAS_COMPONENT]->(c:Component)
        RETURN e,
               collect({type: c.type, properties: c.properties}) as components
        `,
        { id }
      );
    });

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const entityNode = record.get('e');
    const components = record.get('components');

    return {
      id: entityNode.properties.id,
      components: components
        .filter((c: any) => c.type !== null)
        .map((c: any) => ({
          componentType: c.type,
          properties: typeof c.properties === 'string'
            ? JSON.parse(c.properties)
            : c.properties,
        })),
      createdAt: new Date(entityNode.properties.createdAt),
      updatedAt: new Date(entityNode.properties.updatedAt),
    };
  }

  /**
   * Get all entities, optionally filtered by component type
   */
  async getEntities(componentType?: string, limit = 100, offset = 0): Promise<Entity[]> {
    let query: string;
    const params: Record<string, any> = { limit, offset };

    if (componentType) {
      query = `
        MATCH (e:Entity)-[:HAS_COMPONENT]->(c:Component {type: $componentType})
        WITH DISTINCT e
        OPTIONAL MATCH (e)-[:HAS_COMPONENT]->(c2:Component)
        RETURN e,
               collect({type: c2.type, properties: c2.properties}) as components
        ORDER BY e.id
        SKIP $offset
        LIMIT $limit
      `;
      params.componentType = componentType;
    } else {
      query = `
        MATCH (e:Entity)
        OPTIONAL MATCH (e)-[:HAS_COMPONENT]->(c:Component)
        RETURN e,
               collect({type: c.type, properties: c.properties}) as components
        ORDER BY e.id
        SKIP $offset
        LIMIT $limit
      `;
    }

    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(query, params);
    });

    return result.records.map((record: any) => {
      const entityNode = record.get('e');
      const components = record.get('components');

      return {
        id: entityNode.properties.id,
        components: components
          .filter((c: any) => c.type !== null)
          .map((c: any) => ({
            componentType: c.type,
            properties: typeof c.properties === 'string'
              ? JSON.parse(c.properties)
              : c.properties,
          })),
        createdAt: new Date(entityNode.properties.createdAt),
        updatedAt: new Date(entityNode.properties.updatedAt),
      };
    });
  }

  /**
   * Update entity (replace all components)
   */
  async updateEntity(id: string, components: ComponentInput[]): Promise<Entity> {
    const existing = await this.getEntity(id);
    if (!existing) {
      throw new Error(`Entity ${id} not found`);
    }

    // Validate all components
    await this.validateComponents(components);

    await this.memgraph.executeWriteTx(async (tx) => {
      // Delete existing components
      await tx.run(
        `
        MATCH (e:Entity {id: $id})-[r:HAS_COMPONENT]->(c:Component)
        DELETE r, c
        `,
        { id }
      );

      // Create new components
      for (const component of components) {
        await tx.run(
          `
          MATCH (e:Entity {id: $entityId})
          CREATE (c:Component {
            type: $componentType,
            properties: $properties
          })
          CREATE (e)-[:HAS_COMPONENT]->(c)
          `,
          {
            entityId: id,
            componentType: component.componentType,
            properties: JSON.stringify(component.properties),
          }
        );
      }

      // Update timestamp
      await tx.run(
        `
        MATCH (e:Entity {id: $id})
        SET e.updatedAt = timestamp()
        `,
        { id }
      );
    });

    const entity = await this.getEntity(id);
    if (!entity) {
      throw new Error(`Failed to update entity ${id}`);
    }

    return entity;
  }

  /**
   * Delete entity and all its components
   */
  async deleteEntity(id: string): Promise<boolean> {
    const existing = await this.getEntity(id);
    if (!existing) {
      return false;
    }

    await this.memgraph.executeWriteTx(async (tx) => {
      // Delete entity, components, and all relationships
      await tx.run(
        `
        MATCH (e:Entity {id: $id})
        OPTIONAL MATCH (e)-[r1:HAS_COMPONENT]->(c:Component)
        OPTIONAL MATCH (e)-[r2]->()
        OPTIONAL MATCH ()-[r3]->(e)
        DELETE e, c, r1, r2, r3
        `,
        { id }
      );
    });

    return true;
  }

  /**
   * Add a component to an existing entity
   */
  async addComponent(entityId: string, component: ComponentInput): Promise<Entity> {
    const existing = await this.getEntity(entityId);
    if (!existing) {
      throw new Error(`Entity ${entityId} not found`);
    }

    // Check if component type already exists
    const hasComponent = existing.components.some(c => c.componentType === component.componentType);
    if (hasComponent) {
      throw new Error(`Entity ${entityId} already has component type ${component.componentType}`);
    }

    // Validate component
    await this.validateComponents([component]);

    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MATCH (e:Entity {id: $entityId})
        CREATE (c:Component {
          type: $componentType,
          properties: $properties
        })
        CREATE (e)-[:HAS_COMPONENT]->(c)
        SET e.updatedAt = timestamp()
        `,
        {
          entityId,
          componentType: component.componentType,
          properties: JSON.stringify(component.properties),
        }
      );
    });

    const entity = await this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Failed to add component to entity ${entityId}`);
    }

    return entity;
  }

  /**
   * Remove a component from an entity
   */
  async removeComponent(entityId: string, componentType: string): Promise<Entity> {
    const existing = await this.getEntity(entityId);
    if (!existing) {
      throw new Error(`Entity ${entityId} not found`);
    }

    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MATCH (e:Entity {id: $entityId})-[r:HAS_COMPONENT]->(c:Component {type: $componentType})
        DELETE r, c
        SET e.updatedAt = timestamp()
        `,
        { entityId, componentType }
      );
    });

    const entity = await this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Failed to remove component from entity ${entityId}`);
    }

    return entity;
  }

  /**
   * Update a specific component on an entity
   */
  async updateComponent(
    entityId: string,
    componentType: string,
    properties: Record<string, any>
  ): Promise<Entity> {
    const existing = await this.getEntity(entityId);
    if (!existing) {
      throw new Error(`Entity ${entityId} not found`);
    }

    // Validate component
    await this.validateComponents([{ componentType, properties }]);

    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MATCH (e:Entity {id: $entityId})-[:HAS_COMPONENT]->(c:Component {type: $componentType})
        SET c.properties = $properties,
            e.updatedAt = timestamp()
        `,
        {
          entityId,
          componentType,
          properties: JSON.stringify(properties),
        }
      );
    });

    const entity = await this.getEntity(entityId);
    if (!entity) {
      throw new Error(`Failed to update component on entity ${entityId}`);
    }

    return entity;
  }

  /**
   * Create a relationship between two entities
   */
  async createRelationship(
    fromId: string,
    toId: string,
    type: string,
    properties?: Record<string, any>
  ): Promise<void> {
    // Verify entities exist
    const fromEntity = await this.getEntity(fromId);
    const toEntity = await this.getEntity(toId);

    if (!fromEntity) {
      throw new Error(`Source entity ${fromId} not found`);
    }
    if (!toEntity) {
      throw new Error(`Target entity ${toId} not found`);
    }

    // Create relationship with dynamic type
    await this.memgraph.executeWriteTx(async (tx) => {
      const query = `
        MATCH (from:Entity {id: $fromId})
        MATCH (to:Entity {id: $toId})
        CREATE (from)-[r:\`${type}\`]->(to)
        ${properties ? 'SET r += $properties' : ''}
      `;

      await tx.run(query, {
        fromId,
        toId,
        properties: properties || {},
      });
    });
  }

  /**
   * Delete a relationship between two entities
   */
  async deleteRelationship(fromId: string, toId: string, type: string): Promise<boolean> {
    const result = await this.memgraph.executeWriteTx(async (tx) => {
      return await tx.run(
        `
        MATCH (from:Entity {id: $fromId})-[r:\`${type}\`]->(to:Entity {id: $toId})
        DELETE r
        RETURN count(r) as deleted
        `,
        { fromId, toId }
      );
    });

    return result.records[0].get('deleted').toNumber() > 0;
  }

  /**
   * Get all relationships for an entity
   */
  async getRelationships(entityId: string, type?: string): Promise<Relationship[]> {
    const query = type
      ? `
        MATCH (e:Entity {id: $entityId})-[r:\`${type}\`]->(target:Entity)
        RETURN type(r) as relType, target.id as targetId, properties(r) as props
      `
      : `
        MATCH (e:Entity {id: $entityId})-[r]->(target:Entity)
        RETURN type(r) as relType, target.id as targetId, properties(r) as props
      `;

    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(query, { entityId });
    });

    return result.records.map((record: any) => ({
      type: record.get('relType'),
      fromId: entityId,
      toId: record.get('targetId'),
      properties: record.get('props'),
    }));
  }

  /**
   * Validate components against registered component types
   */
  private async validateComponents(components: ComponentInput[]): Promise<void> {
    for (const component of components) {
      const validation = await this.componentTypeManager.validateComponent(
        component.componentType,
        component.properties
      );

      if (!validation.valid) {
        throw new Error(
          `Invalid component '${component.componentType}': ${validation.errors.join(', ')}`
        );
      }
    }
  }
}
