/**
 * Brick Schema Loader Service
 *
 * Loads Brick Schema component types and relationship types on application startup.
 * Registers all Brick types in the component type registry.
 */

import { BRICK_COMPONENT_TYPES, BRICK_RELATIONSHIP_TYPES } from '../../config/brick-schema.config';
import { ComponentTypeManager } from './component-type-manager.service';
import { RelationshipTypeManager } from './relationship-type-manager.service';

export class BrickSchemaLoader {
  constructor(
    private componentTypeManager: ComponentTypeManager,
    private relationshipTypeManager: RelationshipTypeManager
  ) {}

  /**
   * Load all Brick Schema types into the registry
   * Called on application startup
   */
  async loadBrickSchema(): Promise<void> {
    console.log('📦 Loading Brick Schema...');
    console.log('');

    try {
      // Register all Brick component types
      console.log(`   Loading ${BRICK_COMPONENT_TYPES.length} Brick component types...`);
      for (const componentType of BRICK_COMPONENT_TYPES) {
        await this.componentTypeManager.registerComponentType({
          name: componentType.name,
          properties: componentType.properties,
          description: componentType.description,
        });
      }

      // Register all Brick relationship types
      console.log(`   Loading ${BRICK_RELATIONSHIP_TYPES.length} Brick relationship types...`);
      for (const relType of BRICK_RELATIONSHIP_TYPES) {
        await this.relationshipTypeManager.registerRelationshipType({
          name: relType.name,
          fromEntity: relType.domain,
          toEntity: relType.range,
          properties: relType.properties || [],
          description: relType.description,
        });
      }

      console.log('');
      console.log(`✅ Brick Schema loaded successfully!`);
      console.log(`   Component types: ${BRICK_COMPONENT_TYPES.length}`);
      console.log(`   Relationship types: ${BRICK_RELATIONSHIP_TYPES.length}`);
      console.log('');
    } catch (error) {
      console.error('❌ Failed to load Brick Schema:', error);
      throw error;
    }
  }

  /**
   * Get summary of loaded Brick Schema
   */
  getSummary(): {
    componentTypeCount: number;
    relationshipTypeCount: number;
    version: string;
  } {
    return {
      componentTypeCount: BRICK_COMPONENT_TYPES.length,
      relationshipTypeCount: BRICK_RELATIONSHIP_TYPES.length,
      version: '1.3',
    };
  }

  /**
   * List all Brick component type names
   */
  listBrickComponentTypes(): string[] {
    return BRICK_COMPONENT_TYPES.map(ct => ct.name);
  }

  /**
   * List all Brick relationship type names
   */
  listBrickRelationshipTypes(): string[] {
    return BRICK_RELATIONSHIP_TYPES.map(rt => rt.name);
  }
}
