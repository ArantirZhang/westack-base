/**
 * Brick Schema Converter Service
 *
 * Converts Brick Schema from TTL/RDF format to ComponentType and RelationshipType formats.
 * Allows dynamic upload and conversion of Brick Schema files.
 */

import { ComponentTypeManager } from './component-type-manager.service';
import { RelationshipTypeManager } from './relationship-type-manager.service';
import { PropertyDefinition } from '../../models/ecs.model';

/**
 * Brick Schema Upload Result
 */
export interface BrickSchemaUploadResult {
  success: boolean;
  componentTypesLoaded: number;
  relationshipTypesLoaded: number;
  errors: string[];
}

/**
 * Parsed Brick Component Type
 */
interface ParsedBrickComponent {
  name: string;
  properties: PropertyDefinition[];
  description?: string;
}

/**
 * Parsed Brick Relationship Type
 */
interface ParsedBrickRelationship {
  name: string;
  domain: string;
  range: string;
  properties: PropertyDefinition[];
  description?: string;
}

export class BrickSchemaConverter {
  constructor(
    private componentTypeManager: ComponentTypeManager,
    private relationshipTypeManager: RelationshipTypeManager
  ) {}

  /**
   * Parse and load Brick Schema from TTL/RDF string
   */
  async loadBrickSchemaFromTTL(ttlContent: string): Promise<BrickSchemaUploadResult> {
    const result: BrickSchemaUploadResult = {
      success: true,
      componentTypesLoaded: 0,
      relationshipTypesLoaded: 0,
      errors: [],
    };

    try {
      // Parse TTL content
      const parsed = this.parseTTL(ttlContent);

      // Register component types
      for (const component of parsed.componentTypes) {
        try {
          await this.componentTypeManager.registerComponentType({
            name: component.name,
            properties: component.properties,
            description: component.description,
          });
          result.componentTypesLoaded++;
        } catch (error: any) {
          result.errors.push(`Failed to load component type '${component.name}': ${error.message}`);
        }
      }

      // Register relationship types
      for (const relationship of parsed.relationshipTypes) {
        try {
          await this.relationshipTypeManager.registerRelationshipType({
            name: relationship.name,
            fromEntity: relationship.domain,
            toEntity: relationship.range,
            properties: relationship.properties,
            description: relationship.description,
          });
          result.relationshipTypesLoaded++;
        } catch (error: any) {
          result.errors.push(`Failed to load relationship type '${relationship.name}': ${error.message}`);
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(`Failed to parse Brick Schema: ${error.message}`);
    }

    return result;
  }

  /**
   * Parse TTL/RDF content to extract component and relationship types
   *
   * This is a simplified parser. For production use, consider using a proper RDF library
   * like rdflib.js or N3.js for more robust parsing.
   */
  private parseTTL(ttlContent: string): {
    componentTypes: ParsedBrickComponent[];
    relationshipTypes: ParsedBrickRelationship[];
  } {
    const componentTypes: ParsedBrickComponent[] = [];
    const relationshipTypes: ParsedBrickRelationship[] = [];

    // Simple regex-based parsing for Brick Schema
    // Format example:
    // brick:AHU a owl:Class ;
    //   rdfs:subClassOf brick:HVAC_Equipment ;
    //   rdfs:label "Air Handling Unit" .

    const lines = ttlContent.split('\n');
    let currentClass: string | null = null;
    let currentDescription: string | null = null;
    let currentDomain: string | null = null;
    let currentRange: string | null = null;
    let isClass = false;
    let isProperty = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed.length === 0) {
        continue;
      }

      // Detect class definition (component type)
      if (trimmed.includes('a owl:Class') || trimmed.includes('a rdfs:Class')) {
        const match = trimmed.match(/brick:(\w+)\s+a\s+(?:owl|rdfs):Class/);
        if (match) {
          currentClass = match[1];
          isClass = true;
          isProperty = false;
          currentDescription = null;
        }
      }

      // Detect object property (relationship type)
      if (trimmed.includes('a owl:ObjectProperty')) {
        const match = trimmed.match(/brick:(\w+)\s+a\s+owl:ObjectProperty/);
        if (match) {
          currentClass = match[1];
          isClass = false;
          isProperty = true;
          currentDescription = null;
          currentDomain = null;
          currentRange = null;
        }
      }

      // Extract label (description)
      if (trimmed.includes('rdfs:label')) {
        const match = trimmed.match(/rdfs:label\s+"([^"]+)"/);
        if (match) {
          currentDescription = match[1];
        }
      }

      // Extract domain (for relationship types)
      if (trimmed.includes('rdfs:domain')) {
        const match = trimmed.match(/rdfs:domain\s+brick:(\w+)/);
        if (match) {
          currentDomain = match[1];
        }
      }

      // Extract range (for relationship types)
      if (trimmed.includes('rdfs:range')) {
        const match = trimmed.match(/rdfs:range\s+brick:(\w+)/);
        if (match) {
          currentRange = match[1];
        }
      }

      // End of definition (period)
      if (trimmed.endsWith('.')) {
        if (isClass && currentClass) {
          // Add component type
          componentTypes.push({
            name: currentClass,
            properties: this.getDefaultProperties(),
            description: currentDescription || undefined,
          });
        } else if (isProperty && currentClass && currentDomain && currentRange) {
          // Add relationship type
          relationshipTypes.push({
            name: currentClass,
            domain: currentDomain,
            range: currentRange,
            properties: [],
            description: currentDescription || undefined,
          });
        }

        // Reset
        currentClass = null;
        currentDescription = null;
        currentDomain = null;
        currentRange = null;
        isClass = false;
        isProperty = false;
      }
    }

    return { componentTypes, relationshipTypes };
  }

  /**
   * Get default properties for component types
   * These are standard properties that all components should have
   */
  private getDefaultProperties(): PropertyDefinition[] {
    return [
      {
        name: 'id',
        type: 'String',
        required: true,
        description: 'Unique identifier',
      },
      {
        name: 'name',
        type: 'String',
        required: false,
        description: 'Human-readable name',
      },
      {
        name: 'description',
        type: 'String',
        required: false,
        description: 'Description of the component',
      },
    ];
  }

  /**
   * Parse and load Brick Schema from JSON format
   * Alternative format for easier manual creation
   */
  async loadBrickSchemaFromJSON(jsonContent: string): Promise<BrickSchemaUploadResult> {
    const result: BrickSchemaUploadResult = {
      success: true,
      componentTypesLoaded: 0,
      relationshipTypesLoaded: 0,
      errors: [],
    };

    try {
      const parsed = JSON.parse(jsonContent);

      // Register component types
      if (parsed.componentTypes) {
        for (const component of parsed.componentTypes) {
          try {
            await this.componentTypeManager.registerComponentType({
              name: component.name,
              properties: component.properties || this.getDefaultProperties(),
              description: component.description,
            });
            result.componentTypesLoaded++;
          } catch (error: any) {
            result.errors.push(`Failed to load component type '${component.name}': ${error.message}`);
          }
        }
      }

      // Register relationship types
      if (parsed.relationshipTypes) {
        for (const relationship of parsed.relationshipTypes) {
          try {
            await this.relationshipTypeManager.registerRelationshipType({
              name: relationship.name,
              fromEntity: relationship.domain || relationship.fromEntity,
              toEntity: relationship.range || relationship.toEntity,
              properties: relationship.properties || [],
              description: relationship.description,
            });
            result.relationshipTypesLoaded++;
          } catch (error: any) {
            result.errors.push(`Failed to load relationship type '${relationship.name}': ${error.message}`);
          }
        }
      }

      if (result.errors.length > 0) {
        result.success = false;
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(`Failed to parse JSON: ${error.message}`);
    }

    return result;
  }

  /**
   * Auto-detect format and load Brick Schema
   */
  async loadBrickSchema(content: string): Promise<BrickSchemaUploadResult> {
    // Try to detect format
    const trimmed = content.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      // Looks like JSON
      return this.loadBrickSchemaFromJSON(content);
    } else {
      // Assume TTL/RDF
      return this.loadBrickSchemaFromTTL(content);
    }
  }
}
