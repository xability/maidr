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
  /** Runtime scale instances keyed by scale id, laid out with pixel geometry. */
  readonly scales?: Record<string, ChartJsRuntimeScale>;
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
  /** Id of the x scale this dataset is plotted against (defaults to `'x'`). */
  xAxisID?: string;
  /** Id of the y scale this dataset is plotted against (defaults to `'y'`). */
  yAxisID?: string;
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
  /** Which axis this scale belongs to; defaults from the scale id's first letter. */
  axis?: 'x' | 'y';
  /**
   * Which chart edge the scale is placed against. Chart.js also accepts
   * dynamic positions (`'center'` or an `{ [scaleId]: value }` object), hence
   * the loose type; only the static edge strings participate in axis stacking.
   */
  position?: string | Record<string, number>;
  /**
   * Axis-stacking group name (Chart.js >= 3.7). Scales of the same axis kind
   * sharing a `stack` are laid out in separate, non-overlapping bands — the
   * native Chart.js way to express stacked panels within one canvas.
   */
  stack?: string;
  /** Relative size of this scale's band within its axis stack. */
  stackWeight?: number;
}

/**
 * A laid-out runtime scale instance (from `chart.scales`), exposing the pixel
 * band it occupies. Used to order axis-stacked panels by visual position.
 */
export interface ChartJsRuntimeScale {
  axis?: 'x' | 'y' | 'r';
  /** Resolved edge the scale was laid out against. */
  position?: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
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
  /**
   * Outline color used for the DOM highlight overlay drawn on top of the
   * canvas during MAIDR navigation. Accepts any CSS color string.
   * Defaults to a translucent orange.
   */
  highlightColor?: string;
}
