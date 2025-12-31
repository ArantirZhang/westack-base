/**
 * GraphQL Mutation Resolvers
 *
 * Implements all Mutation type resolvers for the ECS-based BMS API
 */

import { ComponentTypeManager } from '../../../schema/component-type-manager.service';
import { RelationshipTypeManager } from '../../../schema/relationship-type-manager.service';
import { EntityManager } from '../../../storage/entity-manager.service';

// Initialize services
const componentTypeManager = new ComponentTypeManager();
const relationshipTypeManager = new RelationshipTypeManager();
const entityManager = new EntityManager(componentTypeManager);

export const mutationResolvers = {
  Mutation: {
    // ============================================
    // Entity Operations
    // ============================================

    createEntity: async (
      _parent: any,
      args: {
        input: {
          id: string;
          components: Array<{ componentType: string; properties: Record<string, any> }>;
        };
      }
    ) => {
      return entityManager.createEntity(args.input);
    },

    updateEntity: async (
      _parent: any,
      args: {
        id: string;
        input: {
          components?: Array<{ componentType: string; properties: Record<string, any> }>;
        };
      }
    ) => {
      if (!args.input.components) {
        throw new Error('components field is required for updateEntity');
      }
      return entityManager.updateEntity(args.id, args.input.components);
    },

    deleteEntity: async (_parent: any, args: { id: string }) => {
      return entityManager.deleteEntity(args.id);
    },

    // ============================================
    // Component Operations (Dynamic)
    // ============================================

    addComponent: async (
      _parent: any,
      args: {
        entityId: string;
        componentType: string;
        properties: Record<string, any>;
      }
    ) => {
      return entityManager.addComponent(args.entityId, {
        componentType: args.componentType,
        properties: args.properties,
      });
    },

    removeComponent: async (
      _parent: any,
      args: { entityId: string; componentType: string }
    ) => {
      return entityManager.removeComponent(args.entityId, args.componentType);
    },

    updateComponent: async (
      _parent: any,
      args: {
        entityId: string;
        componentType: string;
        properties: Record<string, any>;
      }
    ) => {
      return entityManager.updateComponent(
        args.entityId,
        args.componentType,
        args.properties
      );
    },

    // ============================================
    // Custom Type Definitions (Extend Brick Schema)
    // ============================================

    defineComponentType: async (
      _parent: any,
      args: {
        input: {
          name: string;
          properties: Array<{
            name: string;
            type: string;
            required: boolean;
            description?: string;
          }>;
          description?: string;
        };
      }
    ) => {
      const { name, properties, description } = args.input;

      await componentTypeManager.registerComponentType({
        name,
        properties: properties as any,
        isBrickSchema: false,
        description,
      });

      return componentTypeManager.getComponentType(name);
    },

    defineRelationshipType: async (
      _parent: any,
      args: {
        input: {
          name: string;
          fromEntity: string;
          toEntity: string;
          properties?: Array<{
            name: string;
            type: string;
            required: boolean;
            description?: string;
          }>;
          description?: string;
        };
      }
    ) => {
      const { name, fromEntity, toEntity, properties, description } = args.input;

      await relationshipTypeManager.registerRelationshipType({
        name,
        fromEntity,
        toEntity,
        properties: (properties as any) || [],
        isBrickSchema: false,
        description,
      });

      return relationshipTypeManager.getRelationshipType(name);
    },

    // ============================================
    // Relationship Operations
    // ============================================

    createRelationship: async (
      _parent: any,
      args: {
        input: {
          fromId: string;
          toId: string;
          type: string;
          properties?: Record<string, any>;
        };
      }
    ) => {
      const { fromId, toId, type, properties } = args.input;

      await entityManager.createRelationship(fromId, toId, type, properties);

      // Return the created relationship
      const relationships = await entityManager.getRelationships(fromId, type);
      const created = relationships.find((r: any) => r.toId === toId);

      if (!created) {
        throw new Error(`Failed to create relationship ${type} from ${fromId} to ${toId}`);
      }

      return created;
    },

    deleteRelationship: async (
      _parent: any,
      args: { fromId: string; toId: string; type: string }
    ) => {
      return entityManager.deleteRelationship(args.fromId, args.toId, args.type);
    },
  },
};
