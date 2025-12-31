/**
 * Timeseries Data Models
 *
 * Types for InfluxDB timeseries data storage and querying.
 * Used for entity metrics (temperature, pressure, power, etc.)
 */

/**
 * Timeseries Data Point
 * Generic timeseries data point returned from InfluxDB queries
 */
export interface TimeseriesDataPoint {
  timestamp: Date;
  value: number;
  tags?: Record<string, string>;
}

/**
 * InfluxDB Point
 * Data structure for writing to InfluxDB
 */
export interface InfluxPoint {
  measurement: string;          // e.g., "entity_metrics"
  tags: {
    entity_id: string;
    component_type?: string;
    [key: string]: string | undefined;
  };
  fields: {
    value: number;
    [key: string]: number | string | boolean;
  };
  timestamp: Date;
}

/**
 * Entity Metrics
 * Common metrics collected from BMS entities
 */
export interface EntityMetrics {
  entityId: string;
  timestamp: Date;

  // HVAC metrics
  temperature?: number;         // Degrees (F or C)
  humidity?: number;            // Percentage (0-100)
  pressure?: number;            // Pressure units
  airflow?: number;             // CFM or L/s
  co2?: number;                 // PPM

  // Electrical metrics
  voltage?: number;             // Volts
  current?: number;             // Amps
  power?: number;               // Watts
  energy?: number;              // kWh
  frequency?: number;           // Hz
  powerFactor?: number;         // 0-1

  // Battery metrics
  stateOfCharge?: number;       // Percentage (0-100)
  batteryVoltage?: number;      // Volts
  batteryCurrent?: number;      // Amps
  batteryTemperature?: number;  // Degrees
  cycleCount?: number;          // Number of charge cycles

  // Status
  status?: string;              // "online", "offline", "maintenance", "error"
  quality?: number;             // Data quality indicator (0-1)
  alarmState?: string;          // "normal", "warning", "critical"

  // Additional custom metrics
  [key: string]: string | number | boolean | Date | undefined;
}

/**
 * Metrics Query Parameters
 */
export interface MetricsQueryParams {
  entityId: string;
  start: string | Date;         // ISO 8601 or Date object
  end?: string | Date;
  interval?: string;            // e.g., "5m", "1h", "1d"
  aggregation?: 'mean' | 'sum' | 'min' | 'max' | 'last' | 'first';
  fields?: string[];            // Specific fields to query
}

/**
 * Aggregated Metrics Result
 */
export interface AggregatedMetrics {
  timestamp: Date;
  aggregation: string;          // "mean", "sum", "min", "max"
  values: Record<string, number>;
}

/**
 * Batch Write Result
 */
export interface BatchWriteResult {
  success: boolean;
  pointsWritten: number;
  errors?: string[];
  duration: number;             // milliseconds
}

/**
 * InfluxDB Query Result
 */
export interface InfluxQueryResult {
  records: TimeseriesDataPoint[];
  recordCount: number;
  queryTime: number;            // milliseconds
}
