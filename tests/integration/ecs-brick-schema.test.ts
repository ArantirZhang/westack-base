/**
 * ECS with Brick Schema Integration Tests
 *
 * Tests the Entity-Component System implementation with Brick Schema
 */

import { ComponentTypeManager } from '../../src/services/schema/component-type-manager.service';
import { RelationshipTypeManager } from '../../src/services/schema/relationship-type-manager.service';
import { EntityManager } from '../../src/services/storage/entity-manager.service';
import { BrickSchemaLoader } from '../../src/services/schema/brick-loader.service';
import { initMemgraph } from '../../src/database/memgraph.client';
import { initMemgraphSchema } from '../../src/database/init-schema.service';

describe('ECS with Brick Schema', () => {
  let componentTypeManager: ComponentTypeManager;
  let relationshipTypeManager: RelationshipTypeManager;
  let entityManager: EntityManager;
  let brickLoader: BrickSchemaLoader;

  beforeAll(async () => {
    // Initialize database connection
    await initMemgraph();

    // Initialize schema
    await initMemgraphSchema();

    // Initialize managers
    componentTypeManager = new ComponentTypeManager();
    relationshipTypeManager = new RelationshipTypeManager();
    entityManager = new EntityManager(componentTypeManager);

    // Load Brick Schema
    brickLoader = new BrickSchemaLoader(componentTypeManager, relationshipTypeManager);
    await brickLoader.loadBrickSchema();
  });

  describe('Brick Schema Loading', () => {
    it('should load Brick component types', async () => {
      const componentTypes = await componentTypeManager.getAllComponentTypes();
      expect(componentTypes.length).toBeGreaterThan(0);
    });

    it('should have Equipment component type', async () => {
      const equipment = await componentTypeManager.getComponentType('Equipment');
      expect(equipment).toBeDefined();
      expect(equipment?.isBrickSchema).toBe(true);
    });

    it('should have AHU component type', async () => {
      const ahu = await componentTypeManager.getComponentType('AHU');
      expect(ahu).toBeDefined();
      expect(ahu?.isBrickSchema).toBe(true);
    });

    it('should load Brick relationship types', async () => {
      const relationshipTypes = await relationshipTypeManager.getAllRelationshipTypes();
      expect(relationshipTypes.length).toBeGreaterThan(0);
    });

    it('should have feeds relationship type', async () => {
      const feeds = await relationshipTypeManager.getRelationshipType('feeds');
      expect(feeds).toBeDefined();
      expect(feeds?.isBrickSchema).toBe(true);
    });
  });

  describe('Entity Creation with Brick Components', () => {
    it('should create entity with Equipment component', async () => {
      const entity = await entityManager.createEntity({
        id: 'test-equipment-01',
        components: [
          {
            componentType: 'Equipment',
            properties: {
              name: 'Test Equipment',
              manufacturer: 'Acme Corp',
            },
          },
        ],
      });

      expect(entity).toBeDefined();
      expect(entity.id).toBe('test-equipment-01');
      expect(entity.components.length).toBe(1);
      expect(entity.components[0].componentType).toBe('Equipment');
    });

    it('should create entity with multiple Brick components', async () => {
      const entity = await entityManager.createEntity({
        id: 'test-ahu-01',
        components: [
          {
            componentType: 'Equipment',
            properties: {
              name: 'Air Handler Unit 1',
              manufacturer: 'Johnson Controls',
            },
          },
          {
            componentType: 'HVAC_Equipment',
            properties: {
              airflowType: 'variable',
              capacity: 50000,
            },
          },
          {
            componentType: 'AHU',
            properties: {
              fanType: 'centrifugal',
              filterRating: 'MERV-13',
            },
          },
        ],
      });

      expect(entity).toBeDefined();
      expect(entity.id).toBe('test-ahu-01');
      expect(entity.components.length).toBe(3);

      const componentTypes = entity.components.map((c) => c.componentType);
      expect(componentTypes).toContain('Equipment');
      expect(componentTypes).toContain('HVAC_Equipment');
      expect(componentTypes).toContain('AHU');
    });
  });

  describe('Entity Queries', () => {
    it('should get entity by ID', async () => {
      const entity = await entityManager.getEntity('test-ahu-01');
      expect(entity).toBeDefined();
      expect(entity?.id).toBe('test-ahu-01');
    });

    it('should filter entities by component type', async () => {
      const entities = await entityManager.getEntities('AHU');
      expect(entities.length).toBeGreaterThan(0);

      // All entities should have AHU component
      for (const entity of entities) {
        const hasAHU = entity.components.some((c) => c.componentType === 'AHU');
        expect(hasAHU).toBe(true);
      }
    });
  });

  describe('Dynamic Component Management', () => {
    it('should add component to existing entity', async () => {
      const entity = await entityManager.addComponent('test-ahu-01', {
        componentType: 'Temperature_Sensor',
        properties: {
          unit: 'celsius',
          range: '-40 to 125',
        },
      });

      expect(entity.components.length).toBe(4);
      const hasTempSensor = entity.components.some(
        (c) => c.componentType === 'Temperature_Sensor'
      );
      expect(hasTempSensor).toBe(true);
    });

    it('should update component properties', async () => {
      const entity = await entityManager.updateComponent(
        'test-ahu-01',
        'Equipment',
        {
          name: 'Updated AHU Name',
          manufacturer: 'Johnson Controls',
          model: 'YVAA-123',
        }
      );

      const equipment = entity.components.find((c) => c.componentType === 'Equipment');
      expect(equipment?.properties.name).toBe('Updated AHU Name');
      expect(equipment?.properties.model).toBe('YVAA-123');
    });

    it('should remove component from entity', async () => {
      const entity = await entityManager.removeComponent('test-ahu-01', 'Temperature_Sensor');

      expect(entity.components.length).toBe(3);
      const hasTempSensor = entity.components.some(
        (c) => c.componentType === 'Temperature_Sensor'
      );
      expect(hasTempSensor).toBe(false);
    });
  });

  describe('Relationships', () => {
    beforeAll(async () => {
      // Create a second entity for relationship testing
      await entityManager.createEntity({
        id: 'test-vav-01',
        components: [
          {
            componentType: 'Equipment',
            properties: {
              name: 'VAV Box 1',
            },
          },
          {
            componentType: 'VAV',
            properties: {
              maxAirflow: 1000,
            },
          },
        ],
      });
    });

    it('should create relationship using Brick relationship type', async () => {
      await entityManager.createRelationship('test-ahu-01', 'test-vav-01', 'feeds', {});

      const relationships = await entityManager.getRelationships('test-ahu-01');
      expect(relationships.length).toBeGreaterThan(0);

      const feedsRel = relationships.find(
        (r) => r.type === 'feeds' && r.toId === 'test-vav-01'
      );
      expect(feedsRel).toBeDefined();
    });

    it('should query relationships by type', async () => {
      const feedsRelationships = await entityManager.getRelationships('test-ahu-01', 'feeds');
      expect(feedsRelationships.length).toBeGreaterThan(0);
    });

    it('should delete relationship', async () => {
      const deleted = await entityManager.deleteRelationship('test-ahu-01', 'test-vav-01', 'feeds');
      expect(deleted).toBe(true);

      const relationships = await entityManager.getRelationships('test-ahu-01', 'feeds');
      const feedsRel = relationships.find((r) => r.toId === 'test-vav-01');
      expect(feedsRel).toBeUndefined();
    });
  });

  describe('Custom Component Types', () => {
    it('should define custom component type', async () => {
      await componentTypeManager.registerComponentType({
        name: 'BatteryBackup',
        properties: [
          { name: 'capacity', type: 'Number', required: true },
          { name: 'chemistry', type: 'String', required: true },
          { name: 'runtime', type: 'Number', required: false },
        ],
        isBrickSchema: false,
        description: 'Battery backup system for equipment',
      });

      const batteryType = await componentTypeManager.getComponentType('BatteryBackup');
      expect(batteryType).toBeDefined();
      expect(batteryType?.isBrickSchema).toBe(false);
    });

    it('should use custom component type on entity', async () => {
      const entity = await entityManager.addComponent('test-ahu-01', {
        componentType: 'BatteryBackup',
        properties: {
          capacity: 100,
          chemistry: 'Li-ion',
          runtime: 2,
        },
      });

      const hasBattery = entity.components.some((c) => c.componentType === 'BatteryBackup');
      expect(hasBattery).toBe(true);
    });
  });

  describe('Component Type Queries', () => {
    it('should get all component types', async () => {
      const allTypes = await componentTypeManager.getAllComponentTypes();
      expect(allTypes.length).toBeGreaterThan(20); // Should have many Brick types
    });

    it('should filter Brick component types only', async () => {
      const brickTypes = await componentTypeManager.getBrickComponentTypes();
      expect(brickTypes.length).toBeGreaterThan(0);

      for (const type of brickTypes) {
        expect(type.isBrickSchema).toBe(true);
      }
    });

    it('should filter custom component types only', async () => {
      const customTypes = await componentTypeManager.getCustomComponentTypes();
      expect(customTypes.length).toBeGreaterThan(0);

      for (const type of customTypes) {
        expect(type.isBrickSchema).toBe(false);
      }
    });

    it('should count component types', async () => {
      const counts = await componentTypeManager.getCount();
      expect(counts.total).toBeGreaterThan(0);
      expect(counts.brick).toBeGreaterThan(0);
      expect(counts.custom).toBeGreaterThan(0);
      expect(counts.total).toBe(counts.brick + counts.custom);
    });
  });

  describe('Entity Deletion', () => {
    it('should delete entity and all its components', async () => {
      const deleted = await entityManager.deleteEntity('test-equipment-01');
      expect(deleted).toBe(true);

      const entity = await entityManager.getEntity('test-equipment-01');
      expect(entity).toBeNull();
    });
  });
});
