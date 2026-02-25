/**
 * Minimal Chart.js type definitions for the MAIDR plugin.
 *
 * These provide type safety without requiring `chart.js` as a compile-time
 * dependency of the main MAIDR package. At runtime, the actual Chart.js
 * objects will satisfy these interfaces.
 */

/**
 * Union of data value shapes found in Chart.js datasets.
 * Covers native chart types and popular plugins (boxplot, financial, matrix).
 */
export type ChartJsDataValue
  = | number
    | null
    | { x: number; y: number; r?: number }
    | { x: number | string; o: number; h: number; l: number; c: number }
    | {
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      outliers?: number[];
    }
    | { x: string | number; y: string | number; v: number };

/**
 * Minimal representation of a Chart.js chart instance.
 */
export interface ChartJsChart {
  readonly canvas: HTMLCanvasElement;
  readonly data: ChartJsData;
  readonly options: ChartJsOptions;
  readonly config: { readonly type: string };
  getDatasetMeta: (datasetIndex: number) => ChartJsDatasetMeta;
  setActiveElements: (elements: ChartJsActiveElement[]) => void;
  tooltip?: {
    setActiveElements: (
      elements: ChartJsActiveElement[],
      eventPosition: { x: number; y: number },
    ) => void;
  };
  update: (mode?: string) => void;
}

/**
 * Chart.js data configuration.
 */
export interface ChartJsData {
  labels?: (string | number)[];
  datasets: ChartJsDataset[];
}

/**
 * A single dataset in a Chart.js chart.
 */
export interface ChartJsDataset {
  label?: string;
  data: ChartJsDataValue[];
  type?: string;
  stack?: string;
  backgroundColor?: string | string[];
  borderColor?: string | string[];
}

/**
 * Chart.js options object.
 */
export interface ChartJsOptions {
  indexAxis?: 'x' | 'y';
  scales?: Record<string, ChartJsScale>;
  plugins?: Record<string, unknown>;
}

/**
 * A Chart.js scale (axis) configuration.
 */
export interface ChartJsScale {
  title?: { text?: string; display?: boolean };
  type?: string;
  stacked?: boolean;
}

/**
 * Metadata for a dataset (returned by `chart.getDatasetMeta()`).
 */
export interface ChartJsDatasetMeta {
  data: ChartJsMetaElement[];
  type: string;
}

/**
 * A visual element from dataset metadata, providing pixel coordinates.
 */
export interface ChartJsMetaElement {
  x: number;
  y: number;
}

/**
 * Identifies a specific data element in a Chart.js chart.
 */
export interface ChartJsActiveElement {
  datasetIndex: number;
  index: number;
}

/**
 * Chart.js Plugin interface (subset used by MAIDR).
 */
export interface ChartJsPlugin {
  id: string;
  afterInit?: (chart: ChartJsChart, args: unknown, options: unknown) => void;
  afterUpdate?: (chart: ChartJsChart, args: unknown, options: unknown) => void;
  resize?: (
    chart: ChartJsChart,
    args: { size: { width: number; height: number } },
    options: unknown,
  ) => void;
  beforeDestroy?: (chart: ChartJsChart, args: unknown, options: unknown) => void;
}

/**
 * Per-chart options for the MAIDR plugin, configurable via
 * `options.plugins.maidr` in the Chart.js config.
 */
export interface MaidrPluginOptions {
  /** Set to `false` to disable the MAIDR plugin for a specific chart. */
  enabled?: boolean;
  /** Override the auto-detected chart title. */
  title?: string;
  /** Override axis labels. */
  axes?: { x?: string; y?: string };
}
