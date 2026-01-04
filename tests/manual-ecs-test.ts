/**
 * Manual ECS Test Script
 *
 * Run this to manually test the ECS implementation
 * Usage: npx ts-node tests/manual-ecs-test.ts
 */

import { ComponentTypeManager } from '../src/services/schema/component-type-manager.service';
import { RelationshipTypeManager } from '../src/services/schema/relationship-type-manager.service';
import { EntityManager } from '../src/services/storage/entity-manager.service';
import { BrickSchemaLoader } from '../src/services/schema/brick-loader.service';
import { initMemgraph } from '../src/database/memgraph.client';
import { initMemgraphSchema } from '../src/database/init-schema.service';

async function runManualTests() {
  console.log('🧪 Manual ECS + Brick Schema Test');
  console.log('='.repeat(50));
  console.log('');

  try {
    // Step 1: Connect to Memgraph
    console.log('📊 Step 1: Connecting to Memgraph...');
    await initMemgraph();
    console.log('✅ Connected to Memgraph');
    console.log('');

    // Step 2: Initialize schema
    console.log('🔧 Step 2: Initializing schema...');
    await initMemgraphSchema();
    console.log('✅ Schema initialized');
    console.log('');

    // Step 3: Initialize managers
    console.log('🔧 Step 3: Initializing managers...');
    const componentTypeManager = new ComponentTypeManager();
    const relationshipTypeManager = new RelationshipTypeManager();
    const entityManager = new EntityManager(componentTypeManager);
    console.log('✅ Managers initialized');
    console.log('');

    // Step 4: Load Brick Schema
    console.log('📚 Step 4: Loading Brick Schema...');
    const brickLoader = new BrickSchemaLoader(componentTypeManager, relationshipTypeManager);
    await brickLoader.loadBrickSchema();
    console.log('✅ Brick Schema loaded');
    console.log('');

    // Step 5: Query component types
    console.log('📋 Step 5: Querying component types...');
    const allTypes = await componentTypeManager.getAllComponentTypes();
    console.log(`   Total component types: ${allTypes.length}`);
    console.log('');

    // Step 6: Create entity with Brick components
    console.log('🏗️  Step 6: Creating entity with Brick components...');
    const entity = await entityManager.createEntity({
      id: 'manual-test-ahu-01',
      components: [
        {
          componentType: 'Equipment',
          properties: {
            name: 'Test Air Handler',
            manufacturer: 'Test Corp',
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

    console.log(`   Created entity: ${entity.id}`);
    console.log(`   Components: ${entity.components.map((c) => c.componentType).join(', ')}`);
    console.log('');

    // Step 7: Query entity
    console.log('🔍 Step 7: Querying entity...');
    const queriedEntity = await entityManager.getEntity('manual-test-ahu-01');
    console.log(`   Found entity: ${queriedEntity?.id}`);
    console.log(`   Components: ${queriedEntity?.components.length}`);
    console.log('');

    // Step 8: Add component dynamically
    console.log('➕ Step 8: Adding component dynamically...');
    const updatedEntity = await entityManager.addComponent('manual-test-ahu-01', {
      componentType: 'Temperature_Sensor',
      properties: {
        unit: 'celsius',
        range: '-40 to 125',
      },
    });
    console.log(`   Updated entity components: ${updatedEntity.components.length}`);
    console.log('');

    // Step 9: Create second entity
    console.log('🏗️  Step 9: Creating second entity...');
    const vavEntity = await entityManager.createEntity({
      id: 'manual-test-vav-01',
      components: [
        {
          componentType: 'Equipment',
          properties: {
            name: 'Test VAV Box',
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
    console.log(`   Created entity: ${vavEntity.id}`);
    console.log('');

    // Step 10: Create relationship
    console.log('🔗 Step 10: Creating relationship...');
    await entityManager.createRelationship('manual-test-ahu-01', 'manual-test-vav-01', 'feeds', {});
    const relationships = await entityManager.getRelationships('manual-test-ahu-01');
    console.log(`   Created relationship: ${relationships.length} relationship(s)`);
    console.log('');

    // Step 11: Define custom component type
    console.log('🎨 Step 11: Defining custom component type...');
    await componentTypeManager.registerComponentType({
      name: 'BatteryBackup',
      properties: [
        { name: 'capacity', type: 'Number', required: true },
        { name: 'chemistry', type: 'String', required: true },
      ],
      description: 'Custom battery backup component',
    });

    const batteryType = await componentTypeManager.getComponentType('BatteryBackup');
    console.log(`   Created custom component type: ${batteryType?.name}`);
    console.log('');

    // Step 12: Use custom component
    console.log('🔋 Step 12: Using custom component...');
    const entityWithBattery = await entityManager.addComponent('manual-test-ahu-01', {
      componentType: 'BatteryBackup',
      properties: {
        capacity: 100,
        chemistry: 'Li-ion',
      },
    });
    console.log(`   Added custom component: ${entityWithBattery.components.length} total components`);
    console.log('');

    // Cleanup
    console.log('🧹 Cleanup: Deleting test entities...');
    await entityManager.deleteEntity('manual-test-ahu-01');
    await entityManager.deleteEntity('manual-test-vav-01');
    console.log('✅ Cleanup complete');
    console.log('');

    console.log('='.repeat(50));
    console.log('✅ All manual tests passed successfully!');
    console.log('');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
runManualTests()
  .then(() => {
    console.log('👍 Manual test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
