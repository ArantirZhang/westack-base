/**
 * Brick Schema Type Definitions
 *
 * Brick Schema is an open-source ontology for buildings.
 * https://brickschema.org
 *
 * We import Brick classes as flat component types (no hierarchy in ECS).
 * This file defines the structure for Brick component and relationship types.
 */

import { PropertyDefinition } from './ecs.model';

/**
 * Brick Component Type
 * Represents a Brick Schema class (Equipment, HVAC_Equipment, AHU, etc.)
 */
export interface BrickComponentType {
  name: string;
  description: string;
  properties: PropertyDefinition[];
  parentType?: string;          // For reference only - we flatten in ECS
}

/**
 * Brick Relationship Type
 * Represents a Brick Schema relationship (feeds, controls, hasPoint, etc.)
 */
export interface BrickRelationshipType {
  name: string;
  description: string;
  domain: string;               // Source component type
  range: string;                // Target component type
  properties?: PropertyDefinition[];
}

/**
 * Predefined Brick Equipment Component Types
 * These will be loaded on startup and registered in the component registry
 */
export const BRICK_EQUIPMENT_TYPES: string[] = [
  // Base types
  'Equipment',
  'Location',

  // HVAC Equipment
  'HVAC_Equipment',
  'AHU',                        // Air Handling Unit
  'VAV',                        // Variable Air Volume Box
  'FCU',                        // Fan Coil Unit
  'Chiller',
  'Boiler',
  'Cooling_Tower',
  'Heat_Exchanger',
  'Fan',
  'Pump',
  'Damper',
  'Valve',
  'Filter',
  'Humidifier',
  'Dehumidifier',

  // Electrical Equipment
  'Electrical_Equipment',
  'Battery',
  'Inverter',
  'Transformer',
  'Switchgear',
  'Panel',
  'UPS',                        // Uninterruptible Power Supply

  // Lighting Equipment
  'Lighting_Equipment',
  'Luminaire',
  'Lighting_Zone',

  // Safety Equipment
  'Safety_Equipment',
  'Fire_Safety_Equipment',
  'Smoke_Detector',
  'Fire_Alarm',
  'Sprinkler',

  // Elevator Equipment
  'Elevator',

  // Water Equipment
  'Water_Heater',
  'Domestic_Hot_Water_System',
];

/**
 * Predefined Brick Point Component Types
 * Points represent data points in the building (sensors, setpoints, commands)
 */
export const BRICK_POINT_TYPES: string[] = [
  // Base types
  'Point',

  // Sensors
  'Sensor',
  'Temperature_Sensor',
  'Humidity_Sensor',
  'Pressure_Sensor',
  'Flow_Sensor',
  'Air_Flow_Sensor',
  'Water_Flow_Sensor',
  'Differential_Pressure_Sensor',
  'CO2_Sensor',
  'Occupancy_Sensor',
  'Motion_Sensor',
  'Light_Level_Sensor',
  'Power_Sensor',
  'Energy_Sensor',
  'Current_Sensor',
  'Voltage_Sensor',

  // Setpoints
  'Setpoint',
  'Temperature_Setpoint',
  'Humidity_Setpoint',
  'Pressure_Setpoint',
  'Flow_Setpoint',

  // Commands
  'Command',
  'Start_Stop_Command',
  'Enable_Command',
  'Speed_Command',
  'Position_Command',

  // Status
  'Status',
  'On_Off_Status',
  'Enable_Status',
  'Occupancy_Status',
  'Alarm',
  'Fault',
];

/**
 * Predefined Brick Relationship Types
 * Standard Brick Schema relationships between entities
 */
export const BRICK_RELATIONSHIP_TYPES: string[] = [
  'feeds',                      // One equipment feeds another (e.g., chiller feeds AHU)
  'controls',                   // One equipment controls another
  'hasPoint',                   // Equipment has a point (sensor, setpoint, command)
  'isPointOf',                  // Inverse of hasPoint
  'hasPart',                    // Equipment has a sub-component
  'isPartOf',                   // Inverse of hasPart
  'isLocationOf',               // Location contains equipment
  'hasLocation',                // Inverse of isLocationOf
  'hasTag',                     // Entity has a tag
  'isFedBy',                    // Inverse of feeds
  'regulates',                  // Equipment regulates another
];

/**
 * Brick Schema Namespaces
 * For reference - Brick uses these in RDF/OWL format
 */
export const BRICK_NAMESPACES = {
  brick: 'https://brickschema.org/schema/Brick#',
  tag: 'https://brickschema.org/schema/BrickTag#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

/**
 * Brick Schema Version
 */
export const BRICK_VERSION = '1.3';
