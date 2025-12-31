/**
 * GraphQL Type Resolvers
 *
 * Implements field resolvers for nested data in types
 */

import { getInfluxDBClient } from '../../../../database/influxdb.client';
import { ComponentTypeManager } from '../../../schema/component-type-manager.service';
import { EntityManager } from '../../../storage/entity-manager.service';

// Initialize services
const influxdb = getInfluxDBClient();
const componentTypeManager = new ComponentTypeManager();
const entityManager = new EntityManager(componentTypeManager);

export const typeResolvers = {
  // ============================================
  // Entity Type Resolvers
  // ============================================

  Entity: {
    /**
     * Resolve relationships for an entity
     */
    relationships: async (parent: any, args: { type?: string }) => {
      return entityManager.getRelationships(parent.id, args.type);
    },

    /**
     * Resolve timeseries metrics for an entity from InfluxDB
     */
    metrics: async (parent: any, args: { start: string; end: string }) => {
      const fluxQuery = `
        from(bucket: "${influxdb.getBucket()}")
          |> range(start: ${args.start}, stop: ${args.end})
          |> filter(fn: (r) => r.equipment_id == "${parent.id}")
      `;

      const results = await influxdb.query(fluxQuery);

      return results.map((record: any) => ({
        timestamp: record._time,
        value: record._value,
        tags: {
          equipment_id: record.equipment_id,
          vendor: record.vendor,
          point_id: record.point_id,
        },
      }));
    },
  },

  // ============================================
  // Relationship Type Resolvers
  // ============================================

  Relationship: {
    /**
     * Resolve source entity for a relationship
     */
    from: async (parent: any) => {
      return entityManager.getEntity(parent.fromId);
    },

    /**
     * Resolve target entity for a relationship
     */
    to: async (parent: any) => {
      return entityManager.getEntity(parent.toId);
    },

    /**
     * Resolve target entity (deprecated, use 'to' instead)
     */
    target: async (parent: any) => {
      return entityManager.getEntity(parent.toId);
    },
  },

  // ============================================
  // Scalar Type Resolvers
  // ============================================

  JSON: {
    /**
     * Custom JSON scalar for flexible data structures
     */
    __parseValue(value: any) {
      return value; // Value from client
    },
    __serialize(value: any) {
      return value; // Value sent to client
    },
    __parseLiteral(ast: any) {
      if (ast.kind === 'ObjectValue') {
        const obj: any = {};
        ast.fields.forEach((field: any) => {
          obj[field.name.value] = parseASTValue(field.value);
        });
        return obj;
      }
      if (ast.kind === 'ListValue') {
        return ast.values.map(parseASTValue);
      }
      return parseASTValue(ast);
    },
  },
};

/**
 * Helper function to parse AST values for JSON scalar
 */
function parseASTValue(ast: any): any {
  switch (ast.kind) {
    case 'StringValue':
    case 'BooleanValue':
      return ast.value;
    case 'IntValue':
    case 'FloatValue':
      return parseFloat(ast.value);
    case 'ObjectValue':
      const obj: any = {};
      ast.fields.forEach((field: any) => {
        obj[field.name.value] = parseASTValue(field.value);
      });
      return obj;
    case 'ListValue':
      return ast.values.map(parseASTValue);
    case 'NullValue':
      return null;
    default:
      return null;
  }
}
