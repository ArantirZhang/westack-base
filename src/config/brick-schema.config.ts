/**
 * Brick Schema Configuration
 *
 * Defines Brick Schema component types and relationship types
 * that will be loaded on application startup.
 *
 * Brick Schema: https://brickschema.org
 * Version: 1.3
 *
 * NOTE: These are flattened component types (no hierarchy).
 * In ECS, entities compose these components freely.
 */

import { BrickComponentType, BrickRelationshipType } from '../models/brick-schema.model';

/**
 * Brick Component Types
 * Flattened list of Brick Schema classes as composable components
 */
export const BRICK_COMPONENT_TYPES: BrickComponentType[] = [
  // ========================================
  // Base Types
  // ========================================
  {
    name: 'Equipment',
    description: 'General equipment in a building',
    properties: [
      { name: 'name', type: 'String', required: true },
      { name: 'manufacturer', type: 'String', required: false },
      { name: 'model', type: 'String', required: false },
      { name: 'serialNumber', type: 'String', required: false },
      { name: 'installDate', type: 'Date', required: false },
      { name: 'warrantyExpiration', type: 'Date', required: false },
    ],
  },
  {
    name: 'Location',
    description: 'Physical location in a building',
    properties: [
      { name: 'name', type: 'String', required: true },
      { name: 'area', type: 'Number', required: false, description: 'Area in square feet or meters' },
      { name: 'level', type: 'Number', required: false, description: 'Floor level' },
      { name: 'address', type: 'String', required: false },
      { name: 'city', type: 'String', required: false },
      { name: 'country', type: 'String', required: false },
      { name: 'timezone', type: 'String', required: false },
    ],
  },

  // ========================================
  // HVAC Equipment
  // ========================================
  {
    name: 'HVAC_Equipment',
    description: 'Heating, ventilation, and air conditioning equipment',
    properties: [
      { name: 'airflowType', type: 'String', required: false, description: 'constant or variable' },
      { name: 'capacity', type: 'Number', required: false, description: 'Capacity in BTU/hr or tons' },
      { name: 'efficiency', type: 'Number', required: false, description: 'Efficiency rating' },
    ],
  },
  {
    name: 'AHU',
    description: 'Air Handling Unit',
    properties: [
      { name: 'fanType', type: 'String', required: false, description: 'centrifugal, axial, etc.' },
      { name: 'filterRating', type: 'String', required: false, description: 'MERV rating' },
      { name: 'supplyAirflow', type: 'Number', required: false, description: 'CFM' },
      { name: 'returnAirflow', type: 'Number', required: false, description: 'CFM' },
    ],
  },
  {
    name: 'VAV',
    description: 'Variable Air Volume Box',
    properties: [
      { name: 'damperType', type: 'String', required: false },
      { name: 'maxAirflow', type: 'Number', required: false, description: 'CFM' },
      { name: 'minAirflow', type: 'Number', required: false, description: 'CFM' },
      { name: 'reheatType', type: 'String', required: false, description: 'hot water, electric, none' },
    ],
  },
  {
    name: 'Chiller',
    description: 'Chiller equipment for cooling',
    properties: [
      { name: 'refrigerant', type: 'String', required: false, description: 'R-134a, R-410A, etc.' },
      { name: 'compressorType', type: 'String', required: false, description: 'screw, centrifugal, scroll' },
      { name: 'condenserType', type: 'String', required: false, description: 'air-cooled, water-cooled' },
      { name: 'tonnage', type: 'Number', required: false },
    ],
  },
  {
    name: 'Boiler',
    description: 'Boiler for heating',
    properties: [
      { name: 'fuelType', type: 'String', required: false, description: 'natural gas, oil, electric' },
      { name: 'outputCapacity', type: 'Number', required: false, description: 'BTU/hr' },
      { name: 'efficiency', type: 'Number', required: false, description: 'AFUE rating' },
    ],
  },
  {
    name: 'Fan',
    description: 'Fan equipment',
    properties: [
      { name: 'fanType', type: 'String', required: false },
      { name: 'motorHP', type: 'Number', required: false },
      { name: 'maxSpeed', type: 'Number', required: false, description: 'RPM' },
    ],
  },
  {
    name: 'Pump',
    description: 'Pump equipment',
    properties: [
      { name: 'pumpType', type: 'String', required: false, description: 'centrifugal, positive displacement' },
      { name: 'flowRate', type: 'Number', required: false, description: 'GPM' },
      { name: 'headPressure', type: 'Number', required: false, description: 'feet or PSI' },
      { name: 'motorHP', type: 'Number', required: false },
    ],
  },

  // ========================================
  // Electrical Equipment
  // ========================================
  {
    name: 'Electrical_Equipment',
    description: 'Electrical systems and equipment',
    properties: [
      { name: 'voltage', type: 'Number', required: false },
      { name: 'current', type: 'Number', required: false },
      { name: 'phase', type: 'String', required: false, description: 'single, three' },
    ],
  },
  {
    name: 'Battery',
    description: 'Battery storage system',
    properties: [
      { name: 'chemistry', type: 'String', required: false, description: 'Li-ion, LiFePO4, Lead-acid' },
      { name: 'capacity', type: 'Number', required: false, description: 'kWh' },
      { name: 'voltage', type: 'Number', required: false },
      { name: 'maxChargeRate', type: 'Number', required: false, description: 'kW' },
      { name: 'maxDischargeRate', type: 'Number', required: false, description: 'kW' },
    ],
  },
  {
    name: 'Inverter',
    description: 'Power inverter',
    properties: [
      { name: 'ratedPower', type: 'Number', required: false, description: 'kW' },
      { name: 'efficiency', type: 'Number', required: false, description: 'Percentage' },
      { name: 'inputVoltage', type: 'Number', required: false },
      { name: 'outputVoltage', type: 'Number', required: false },
    ],
  },

  // ========================================
  // Points (Sensors, Setpoints, Commands)
  // ========================================
  {
    name: 'Point',
    description: 'A data point in the building',
    properties: [
      { name: 'unit', type: 'String', required: false, description: 'degF, %, PSI, etc.' },
      { name: 'description', type: 'String', required: false },
      { name: 'interval', type: 'Number', required: false, description: 'Update interval in seconds' },
    ],
  },
  {
    name: 'Sensor',
    description: 'A sensor point',
    properties: [
      { name: 'accuracy', type: 'Number', required: false },
      { name: 'resolution', type: 'Number', required: false },
      { name: 'calibrationDate', type: 'Date', required: false },
    ],
  },
  {
    name: 'Temperature_Sensor',
    description: 'Temperature measurement sensor',
    properties: [
      { name: 'rangeMin', type: 'Number', required: false },
      { name: 'rangeMax', type: 'Number', required: false },
      { name: 'sensorType', type: 'String', required: false, description: 'RTD, thermocouple, thermistor' },
    ],
  },
  {
    name: 'Humidity_Sensor',
    description: 'Humidity measurement sensor',
    properties: [
      { name: 'rangeMin', type: 'Number', required: false, description: 'Minimum %RH' },
      { name: 'rangeMax', type: 'Number', required: false, description: 'Maximum %RH' },
    ],
  },
  {
    name: 'Pressure_Sensor',
    description: 'Pressure measurement sensor',
    properties: [
      { name: 'rangeMin', type: 'Number', required: false },
      { name: 'rangeMax', type: 'Number', required: false },
      { name: 'pressureType', type: 'String', required: false, description: 'absolute, gauge, differential' },
    ],
  },
  {
    name: 'Flow_Sensor',
    description: 'Flow measurement sensor',
    properties: [
      { name: 'rangeMin', type: 'Number', required: false },
      { name: 'rangeMax', type: 'Number', required: false },
      { name: 'fluidType', type: 'String', required: false, description: 'air, water, refrigerant' },
    ],
  },
  {
    name: 'Power_Sensor',
    description: 'Power measurement sensor',
    properties: [
      { name: 'rangeMin', type: 'Number', required: false, description: 'kW' },
      { name: 'rangeMax', type: 'Number', required: false, description: 'kW' },
      { name: 'phase', type: 'String', required: false },
    ],
  },
  {
    name: 'Setpoint',
    description: 'A setpoint for control',
    properties: [
      { name: 'defaultValue', type: 'Number', required: false },
      { name: 'minValue', type: 'Number', required: false },
      { name: 'maxValue', type: 'Number', required: false },
    ],
  },
  {
    name: 'Command',
    description: 'A command point',
    properties: [
      { name: 'commandType', type: 'String', required: false, description: 'binary, analog, multi-state' },
      { name: 'priority', type: 'Number', required: false, description: 'BACnet priority 1-16' },
    ],
  },
];

/**
 * Brick Relationship Types
 * Standard Brick Schema relationships
 */
export const BRICK_RELATIONSHIP_TYPES: BrickRelationshipType[] = [
  {
    name: 'feeds',
    description: 'One equipment feeds another (e.g., chiller feeds AHU)',
    domain: 'Equipment',
    range: 'Equipment',
  },
  {
    name: 'controls',
    description: 'One equipment controls another',
    domain: 'Equipment',
    range: 'Equipment',
  },
  {
    name: 'hasPoint',
    description: 'Equipment has a point (sensor, setpoint, command)',
    domain: 'Equipment',
    range: 'Point',
  },
  {
    name: 'isPointOf',
    description: 'Point belongs to equipment (inverse of hasPoint)',
    domain: 'Point',
    range: 'Equipment',
  },
  {
    name: 'hasPart',
    description: 'Equipment has a sub-component',
    domain: 'Equipment',
    range: 'Equipment',
  },
  {
    name: 'isPartOf',
    description: 'Equipment is part of another (inverse of hasPart)',
    domain: 'Equipment',
    range: 'Equipment',
  },
  {
    name: 'isLocationOf',
    description: 'Location contains equipment',
    domain: 'Location',
    range: 'Equipment',
  },
  {
    name: 'hasLocation',
    description: 'Equipment is located in a location (inverse of isLocationOf)',
    domain: 'Equipment',
    range: 'Location',
  },
  {
    name: 'isFedBy',
    description: 'Equipment is fed by another (inverse of feeds)',
    domain: 'Equipment',
    range: 'Equipment',
  },
  {
    name: 'regulates',
    description: 'Equipment regulates another',
    domain: 'Equipment',
    range: 'Equipment',
  },
];
