/**
 * Component Type Manager Service
 *
 * Manages the registry of component types (both Brick Schema and custom).
 * Component types are stored as :ComponentType meta-nodes in Memgraph.
 */

import { getMemgraphClient } from '../../database/memgraph.client';
import { ComponentType, PropertyDefinition } from '../../models/ecs.model';

export class ComponentTypeManager {
  private memgraph = getMemgraphClient();

  /**
   * Register a component type
   * Stored as :ComponentType meta-node in Memgraph
   */
  async registerComponentType(data: {
    name: string;
    properties: PropertyDefinition[];
    description?: string;
  }): Promise<void> {
    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MERGE (ct:ComponentType {name: $name})
        SET ct.properties = $properties,
            ct.description = $description,
            ct.updatedAt = timestamp()
        `,
        {
          name: data.name,
          properties: JSON.stringify(data.properties),
          description: data.description || null,
        }
      );
    });
  }

  /**
   * Get a component type by name
   */
  async getComponentType(name: string): Promise<ComponentType | null> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (ct:ComponentType {name: $name})
        RETURN ct
        `,
        { name }
      );
    });

    if (result.records.length === 0) {
      return null;
    }

    const node = result.records[0].get('ct');
    return this.mapToComponentType(node.properties);
  }

  /**
   * Get all component types
   */
  async getAllComponentTypes(): Promise<ComponentType[]> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (ct:ComponentType)
        RETURN ct
        ORDER BY ct.name
        `
      );
    });

    return result.records.map((record: any) =>
      this.mapToComponentType(record.get('ct').properties)
    );
  }


  /**
   * Check if a component type exists
   */
  async exists(name: string): Promise<boolean> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (ct:ComponentType {name: $name})
        RETURN count(ct) as count
        `,
        { name }
      );
    });

    return result.records[0].get('count').toNumber() > 0;
  }

  /**
   * Delete a component type
   */
  async deleteComponentType(name: string): Promise<void> {
    const componentType = await this.getComponentType(name);

    if (!componentType) {
      throw new Error(`Component type '${name}' not found`);
    }

    await this.memgraph.executeWriteTx(async (tx) => {
      await tx.run(
        `
        MATCH (ct:ComponentType {name: $name})
        DELETE ct
        `,
        { name }
      );
    });
  }

  /**
   * Get count of component types
   */
  async getCount(): Promise<number> {
    const result = await this.memgraph.executeReadTx(async (tx) => {
      return await tx.run(
        `
        MATCH (ct:ComponentType)
        RETURN count(ct) as total
        `
      );
    });

    return result.records[0].get('total').toNumber();
  }

  /**
   * Validate component properties against component type schema
   */
  async validateComponent(componentType: string, properties: Record<string, any>): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const type = await this.getComponentType(componentType);

    if (!type) {
      return {
        valid: false,
        errors: [`Unknown component type: ${componentType}`],
      };
    }

    const errors: string[] = [];

    // Check required properties
    for (const prop of type.properties) {
      if (prop.required && !(prop.name in properties)) {
        errors.push(`Missing required property: ${prop.name}`);
      }

      // Type validation (basic)
      if (prop.name in properties) {
        const value = properties[prop.name];
        const valid = this.validatePropertyType(value, prop.type);
        if (!valid) {
          errors.push(`Invalid type for property '${prop.name}': expected ${prop.type}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Map Memgraph node properties to ComponentType
   */
  private mapToComponentType(props: any): ComponentType {
    return {
      name: props.name,
      properties: typeof props.properties === 'string'
        ? JSON.parse(props.properties)
        : props.properties,
      description: props.description,
    };
  }

  /**
   * Validate property type (basic validation)
   */
  private validatePropertyType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'String':
        return typeof value === 'string';
      case 'Number':
        return typeof value === 'number';
      case 'Boolean':
        return typeof value === 'boolean';
      case 'Date':
        return value instanceof Date || typeof value === 'string';
      case 'JSON':
        return true; // Any value is valid for JSON
      default:
        return true;
    }
  }
}
