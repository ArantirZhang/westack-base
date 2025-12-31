/**
 * GraphQL Query Resolvers
 *
 * Implements all Query type resolvers for the ECS-based BMS API
 */

import { getMemgraphClient } from '../../../../database/memgraph.client';
import { getInfluxDBClient } from '../../../../database/influxdb.client';
import { ComponentTypeManager } from '../../../schema/component-type-manager.service';
import { RelationshipTypeManager } from '../../../schema/relationship-type-manager.service';
import { EntityManager } from '../../../storage/entity-manager.service';

// Initialize services
const memgraph = getMemgraphClient();
const influxdb = getInfluxDBClient();
const componentTypeManager = new ComponentTypeManager();
const relationshipTypeManager = new RelationshipTypeManager();
const entityManager = new EntityManager(componentTypeManager);

export const queryResolvers = {
  Query: {
    // ============================================
    // System Health Queries
    // ============================================

    hello: () => 'WeStack BMS Data Layer - ECS with Brick Schema',

    health: async () => {
      const memgraphHealth = await memgraph.healthCheck();
      const influxHealth = await influxdb.healthCheck();

      if (memgraphHealth && influxHealth) {
        return 'OK';
      }
      return 'DEGRADED';
    },

    version: () => process.env.npm_package_version || '1.0.0',

    systemInfo: async () => {
      const memgraphStats = await memgraph.getStats();
      const bucket = influxdb.getBucket();

      return {
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memgraphNodes: memgraphStats.nodeCount,
        memgraphRelationships: memgraphStats.relationshipCount,
        influxBucket: bucket,
      };
    },

    databaseHealth: async () => {
      const memgraphHealth = await memgraph.healthCheck();
      const influxHealth = await influxdb.healthCheck();

      return {
        memgraph: memgraphHealth ? 'HEALTHY' : 'UNHEALTHY',
        influxdb: influxHealth ? 'HEALTHY' : 'UNHEALTHY',
        overall: memgraphHealth && influxHealth ? 'HEALTHY' : 'DEGRADED',
      };
    },

    // ============================================
    // Entity Queries
    // ============================================

    entity: async (_parent: any, args: { id: string }) => {
      return entityManager.getEntity(args.id);
    },

    entities: async (
      _parent: any,
      args: { componentType?: string; limit?: number; offset?: number }
    ) => {
      const limit = args.limit || 100;
      const offset = args.offset || 0;
      return entityManager.getEntities(args.componentType, limit, offset);
    },

    // ============================================
    // Component Type Registry Queries
    // ============================================

    componentTypes: async () => {
      return componentTypeManager.getAllComponentTypes();
    },

    componentType: async (_parent: any, args: { name: string }) => {
      return componentTypeManager.getComponentType(args.name);
    },

    brickComponentTypes: async () => {
      return componentTypeManager.getBrickComponentTypes();
    },

    customComponentTypes: async () => {
      return componentTypeManager.getCustomComponentTypes();
    },

    // ============================================
    // Relationship Type Registry Queries
    // ============================================

    relationshipTypes: async () => {
      return relationshipTypeManager.getAllRelationshipTypes();
    },

    relationshipType: async (_parent: any, args: { name: string }) => {
      return relationshipTypeManager.getRelationshipType(args.name);
    },

    brickRelationshipTypes: async () => {
      return relationshipTypeManager.getBrickRelationshipTypes();
    },

    // ============================================
    // Entity Relationship Queries
    // ============================================

    entityRelationships: async (
      _parent: any,
      args: { entityId: string; type?: string }
    ) => {
      return entityManager.getRelationships(args.entityId, args.type);
    },

    findPath: async (
      _parent: any,
      args: { fromId: string; toId: string; maxDepth?: number }
    ) => {
      const maxDepth = args.maxDepth || 5;

      // Find shortest path between entities
      const result = await memgraph.executeReadTx(async (tx: any) => {
        return await tx.run(
          `
          MATCH path = shortestPath(
            (from:Entity {id: $fromId})-[*1..${maxDepth}]-(to:Entity {id: $toId})
          )
          RETURN path, length(path) as pathLength
          `,
          { fromId: args.fromId, toId: args.toId }
        );
      });

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0];
      const path = record.get('path');
      const pathLength = record.get('pathLength').toNumber();

      // Extract entities and relationships from path
      const entities: string[] = [];
      const relationships: any[] = [];

      for (let i = 0; i < path.segments.length; i++) {
        const segment = path.segments[i];
        entities.push(segment.start.properties.id);
        relationships.push({
          type: segment.relationship.type,
          fromId: segment.start.properties.id,
          toId: segment.end.properties.id,
          properties: segment.relationship.properties,
        });
      }

      // Add final entity
      if (path.segments.length > 0) {
        const lastSegment = path.segments[path.segments.length - 1];
        entities.push(lastSegment.end.properties.id);
      }

      return {
        entities,
        relationships,
        pathLength,
      };
    },
  },
};
