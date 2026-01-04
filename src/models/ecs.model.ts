/**
 * Entity-Component System (ECS) Type Definitions
 *
 * Core interfaces for the Entity-Component System architecture.
 * Entities compose components dynamically - no rigid inheritance hierarchies.
 */

/**
 * Entity - The core data container
 * Entities don't have fixed properties - they compose components
 */
export interface Entity {
  id: string;
  components: Component[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Component - Attached to entities to provide data and behavior
 * Example: { componentType: "Equipment", properties: { name: "AHU-01", manufacturer: "Johnson" } }
 */
export interface Component {
  componentType: string;        // e.g., "Equipment", "HVAC_Equipment", "AHU"
  properties: Record<string, any>;
}

/**
 * ComponentType - Defines the schema for a component type
 * Stored as meta-nodes in Memgraph (:ComponentType)
 */
export interface ComponentType {
  name: string;
  properties: PropertyDefinition[];
  description?: string;
}

/**
 * PropertyDefinition - Defines a property in a component type schema
 */
export interface PropertyDefinition {
  name: string;
  type: 'String' | 'Number' | 'Boolean' | 'Date' | 'JSON';
  required: boolean;
  description?: string;
}

/**
 * Relationship - Connection between two entities
 * Example: Entity "chiller-01" -[feeds]-> Entity "ahu-01"
 */
export interface Relationship {
  type: string;                 // e.g., "feeds", "controls", "hasPoint"
  fromId: string;
  toId: string;
  properties?: Record<string, any>;
}

/**
 * RelationshipType - Defines the schema for a relationship type
 * Stored as meta-nodes in Memgraph (:RelationshipType)
 */
export interface RelationshipType {
  name: string;
  fromEntity: string;           // Component type or "Any"
  toEntity: string;             // Component type or "Any"
  properties: PropertyDefinition[];
  description?: string;
}

/**
 * Input types for GraphQL mutations
 */
export interface ComponentInput {
  componentType: string;
  properties: Record<string, any>;
}

export interface CreateEntityInput {
  id: string;
  components: ComponentInput[];
}

export interface UpdateEntityInput {
  components?: ComponentInput[];
}

export interface DefineComponentTypeInput {
  name: string;
  properties: PropertyDefinition[];
  description?: string;
}

export interface DefineRelationshipTypeInput {
  name: string;
  fromEntity: string;
  toEntity: string;
  properties?: PropertyDefinition[];
  description?: string;
}

export interface CreateRelationshipInput {
  fromId: string;
  toId: string;
  type: string;
  properties?: Record<string, any>;
}

/**
 * Path finding results
 */
export interface PathResult {
  nodes: PathNode[];
  relationships: PathRelationship[];
  length: number;
}

export interface PathNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

export interface PathRelationship {
  type: string;
  properties?: Record<string, any>;
}
