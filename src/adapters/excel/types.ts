/**
 * The slice of the Office JavaScript API this adapter reads, and the plain
 * snapshot of one chart it reads it into.
 *
 * Declared structurally rather than imported from `@types/office-js`: Office.js
 * is loaded by the add-in's task pane from Microsoft's CDN, and typing MAIDR
 * against one version of its declarations would tie every consumer of this
 * bundle to it. Only the members read here are declared, each one named after
 * the Office.js member it stands for and present since the requirement set
 * noted beside it, so the real `Excel` and `Office` objects are accepted as
 * they are and a test can hand over plain fakes.
 *
 * Everything below `ExcelChartSnapshot` is data, not API: what one read of a
 * chart produced, which `convertExcelChart` turns into a MAIDR figure without
 * touching Office.js at all.
 *
 * @see https://learn.microsoft.com/javascript/api/excel
 */

/**
 * A value Office.js fills in on the next `context.sync()`
 * (`OfficeExtension.ClientResult<T>`). Reading `value` before the sync throws.
 */
export interface ExcelClientResult<T> {
  readonly value: T;
}

/**
 * The dimensions `ChartSeries.getDimensionValues` reads
 * (`Excel.ChartSeriesDimension`). A scatter's points are `XValues` and
 * `YValues`; every other chart's are `Categories` and `Values`.
 */
export type ExcelChartSeriesDimension = 'Categories' | 'Values' | 'XValues' | 'YValues' | 'BubbleSizes';

/**
 * Anything Office.js loads properties into (`OfficeExtension.ClientObject`).
 *
 * `load` only queues the request; the properties are readable after the next
 * `context.sync()`.
 */
export interface ExcelLoadable {
  load: (propertyNames?: string | string[]) => unknown;
}

/**
 * A title with text and a visibility (`Excel.ChartTitle`, `Excel.ChartAxisTitle`;
 * ExcelApi 1.1).
 */
export interface ExcelTitle extends ExcelLoadable {
  readonly text: string;
  readonly visible: boolean;
}

/** One axis of a chart (`Excel.ChartAxis`; ExcelApi 1.1). */
export interface ExcelChartAxis {
  readonly title: ExcelTitle;
}

/** A chart's axes (`Excel.ChartAxes`). */
export interface ExcelChartAxes {
  /** The category axis; on a scatter, the horizontal value axis (ExcelApi 1.1). */
  readonly categoryAxis: ExcelChartAxis;
  /** The primary value axis (ExcelApi 1.1). */
  readonly valueAxis: ExcelChartAxis;
  /**
   * The series axis of a 3-D chart, along which a surface's series run
   * (ExcelApi 1.1).
   */
  readonly seriesAxis: ExcelChartAxis;
  /**
   * An axis by type and group (ExcelApi 1.7). Read only for the secondary value
   * axis, which a series plotted against it is measured on.
   */
  getItem: (type: 'Category' | 'Value', group: 'Primary' | 'Secondary') => ExcelChartAxis;
}

/**
 * How a histogram or Pareto series is binned (`Excel.ChartBinOptions`;
 * ExcelApi 1.9).
 */
export interface ExcelChartBinOptions extends ExcelLoadable {
  /** `Category`, `Auto`, `BinWidth` or `BinCount`. */
  readonly type: string;
  /** The bin width, for `BinWidth`. */
  readonly width: number;
  /** The number of bins, overflow and underflow included, for `BinCount`. */
  readonly count: number;
  /** Whether values above `overflowValue` share one bin. */
  readonly allowOverflow: boolean;
  readonly overflowValue: number;
  /** Whether values at or below `underflowValue` share one bin. */
  readonly allowUnderflow: boolean;
  readonly underflowValue: number;
}

/**
 * How a box and whisker series is computed (`Excel.ChartBoxwhiskerOptions`;
 * ExcelApi 1.9).
 */
export interface ExcelChartBoxwhiskerOptions extends ExcelLoadable {
  /** `Inclusive` or `Exclusive`: how the quartiles are calculated. */
  readonly quartileCalculation: string;
}

/**
 * One series of a chart (`Excel.ChartSeries`).
 *
 * Enumerated properties are declared as `string`: Office.js types them as an
 * enum or its string values, and an enum member is not assignable to a
 * string literal.
 */
export interface ExcelChartSeries extends ExcelLoadable {
  /** The series name, as the legend shows it (ExcelApi 1.1). */
  readonly name: string;
  /**
   * What this series is drawn as (ExcelApi 1.7). In a combo chart each series
   * carries its own type, a column series beside a line series.
   */
  readonly chartType: string;
  /** `Primary` or `Secondary`: which value axis the series is measured on (ExcelApi 1.8). */
  readonly axisGroup: string;
  /**
   * Whether a chart filter hides the series (ExcelApi 1.7). A filtered series
   * is not drawn.
   */
  readonly filtered: boolean;
  /**
   * The angle of a pie's first slice, in degrees clockwise from 12 o'clock
   * (ExcelApi 1.8). Valid only on a pie or doughnut series.
   */
  readonly firstSliceAngle: number;
  /**
   * How a pie of pie or bar of pie splits its points between the two plots:
   * `SplitByPosition`, `SplitByValue`, `SplitByPercentValue` or
   * `SplitByCustomSplit` (ExcelApi 1.8).
   */
  readonly splitType: string;
  /**
   * The threshold of that split: how many points, from the end, for a split
   * by position; the value or the percentage below which a point is split
   * off otherwise (ExcelApi 1.9).
   */
  readonly splitValue: number;
  /** A histogram's or Pareto chart's binning (ExcelApi 1.9). */
  readonly binOptions: ExcelChartBinOptions;
  /** A box and whisker chart's quartile calculation (ExcelApi 1.9). */
  readonly boxwhiskerOptions: ExcelChartBoxwhiskerOptions;
  /** The values of one dimension, as strings (ExcelApi 1.12). */
  getDimensionValues: (dimension: ExcelChartSeriesDimension) => ExcelClientResult<string[]>;
  /**
   * Where a dimension's values come from, such as `Sheet1!$A$2:$A$9`
   * (ExcelApi 1.15).
   */
  getDimensionDataSourceString: (dimension: ExcelChartSeriesDimension) => ExcelClientResult<string>;
  /**
   * What kind of source that is: `LocalRange`, `ExternalRange`, `List` or
   * `Unknown` (ExcelApi 1.15).
   */
  getDimensionDataSourceType: (dimension: ExcelChartSeriesDimension) => ExcelClientResult<string>;
}

/** A chart's series (`Excel.ChartSeriesCollection`). */
export interface ExcelChartSeriesCollection extends ExcelLoadable {
  /** The loaded series, in plot order. */
  readonly items: readonly ExcelChartSeries[];
}

/** A rectangle of cells (`Excel.Range`). */
export interface ExcelRange extends ExcelLoadable {
  /**
   * Each cell's text as Excel displays it, `[row][column]` (ExcelApi 1.1).
   * Never the `####` a too-narrow column shows.
   */
  readonly text: readonly (readonly string[])[];
}

/** A worksheet (`Excel.Worksheet`). */
export interface ExcelWorksheet extends ExcelLoadable {
  /** ExcelApi 1.1. */
  readonly id: string;
  /** ExcelApi 1.1. */
  readonly name: string;
  /** `Visible`, `Hidden` or `VeryHidden` (ExcelApi 1.1). */
  readonly visibility: string;
  /** The charts on the worksheet (ExcelApi 1.1). */
  readonly charts: ExcelChartCollection;
  /** A range of this worksheet by address, such as `A2:A9` (ExcelApi 1.1). */
  getRange: (address: string) => ExcelRange;
}

/** A chart (`Excel.Chart`). */
export interface ExcelChart extends ExcelLoadable {
  /** ExcelApi 1.7. */
  readonly id: string;
  /** The chart object's name, such as `Chart 1` (ExcelApi 1.1). */
  readonly name: string;
  /** ExcelApi 1.7; see `Excel.ChartType`. */
  readonly chartType: string;
  /**
   * How a blank cell is plotted: `NotPlotted`, `Zero` or `Interplotted`
   * (ExcelApi 1.8).
   */
  readonly displayBlanksAs: string;
  /** ExcelApi 1.1. */
  readonly title: ExcelTitle;
  /** ExcelApi 1.1. */
  readonly axes: ExcelChartAxes;
  /** ExcelApi 1.1. */
  readonly series: ExcelChartSeriesCollection;
  /** The worksheet the chart is on (ExcelApi 1.2). */
  readonly worksheet: ExcelWorksheet;
  /**
   * `true` when an `…OrNullObject` method found no chart. Present on every
   * Office.js object; read only after `getActiveChartOrNullObject`.
   */
  readonly isNullObject?: boolean;
  /**
   * The chart as Excel draws it, a base64-encoded PNG, scaled to `width` with
   * its aspect ratio kept (ExcelApi 1.2).
   */
  getImage: (width?: number) => ExcelClientResult<string>;
}

/**
 * The handlers of one Office.js event (`OfficeExtension.EventHandlers<T>`).
 *
 * `add` queues the registration; it takes effect on the next `context.sync()`.
 */
export interface ExcelEventHandlers<T> {
  add: (handler: (event: T) => Promise<unknown>) => ExcelEventHandlerResult;
}

/**
 * A registered handler (`OfficeExtension.EventHandlerResult`). It can only be
 * removed through the request context it was added in.
 */
export interface ExcelEventHandlerResult {
  /**
   * The context the handler was added in. Its `sync` sends the removal, which
   * is what `Excel.run(result.context, …)` does once its batch has run.
   */
  readonly context: { sync: () => Promise<unknown> };
  /** Queue the removal; it takes effect on that context's next sync. */
  remove: () => void;
}

/**
 * A chart was activated in the workbook (`Excel.ChartActivatedEventArgs`;
 * ExcelApi 1.8).
 */
export interface ExcelChartActivatedEvent {
  readonly chartId: string;
  readonly worksheetId: string;
}

/** A worksheet was added (`Excel.WorksheetAddedEventArgs`; ExcelApi 1.7). */
export interface ExcelWorksheetAddedEvent {
  readonly worksheetId: string;
}

/** The charts of one worksheet (`Excel.ChartCollection`). */
export interface ExcelChartCollection extends ExcelLoadable {
  /** The loaded charts. */
  readonly items: readonly ExcelChart[];
  /** A chart on this worksheet was activated (ExcelApi 1.8). */
  readonly onActivated: ExcelEventHandlers<ExcelChartActivatedEvent>;
  /** A chart was added to this worksheet (ExcelApi 1.8). */
  readonly onAdded: ExcelEventHandlers<unknown>;
  /** A chart was deleted from this worksheet (ExcelApi 1.8). */
  readonly onDeleted: ExcelEventHandlers<unknown>;
}

/** The workbook's worksheets (`Excel.WorksheetCollection`). */
export interface ExcelWorksheetCollection extends ExcelLoadable {
  /** The loaded worksheets, in tab order. */
  readonly items: readonly ExcelWorksheet[];
  /**
   * A worksheet by name or id; a null object when there is none
   * (ExcelApi 1.4).
   */
  getItemOrNullObject: (key: string) => ExcelWorksheet & { readonly isNullObject?: boolean };
  /** A cell changed on any worksheet (ExcelApi 1.9). */
  readonly onChanged: ExcelEventHandlers<unknown>;
  /** Any worksheet was recalculated (ExcelApi 1.8). */
  readonly onCalculated: ExcelEventHandlers<unknown>;
  /** A worksheet was added (ExcelApi 1.7). */
  readonly onAdded: ExcelEventHandlers<ExcelWorksheetAddedEvent>;
  /** A worksheet was deleted (ExcelApi 1.7). */
  readonly onDeleted: ExcelEventHandlers<unknown>;
}

/** The workbook (`Excel.Workbook`). */
export interface ExcelWorkbook {
  readonly worksheets: ExcelWorksheetCollection;
  /** The chart the user has activated, or a null object (ExcelApi 1.9). */
  getActiveChartOrNullObject: () => ExcelChart;
}

/** A batch's request context (`Excel.RequestContext`). */
export interface ExcelRequestContext {
  readonly workbook: ExcelWorkbook;
  /** Send the queued requests and fill in what they load. */
  sync: () => Promise<unknown>;
}

/**
 * The `Excel` namespace object Office.js defines, of which only `run` is used:
 * it opens a request context for one batch of reads.
 */
export interface ExcelHost {
  run: <T>(batch: (context: ExcelRequestContext) => Promise<T>) => Promise<T>;
}

/**
 * The `Office` namespace object Office.js defines, of which only the
 * requirement-set check and the readiness promise are used.
 */
export interface OfficeHost {
  /** Undefined until Office.js has initialized. */
  readonly context?: {
    readonly requirements?: {
      /** `isSetSupported('ExcelApi', '1.12')`. */
      isSetSupported: (name: string, minVersion?: string) => boolean;
    };
  };
  /** Resolves once Office.js has initialized; immediately if it has. */
  onReady?: () => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

/** A title as Excel reports it: its text, and whether the chart shows it. */
export interface ExcelTitleSnapshot {
  readonly text: string;
  readonly visible: boolean;
}

/** One axis, as far as the reading needs it. */
export interface ExcelAxisSnapshot {
  readonly title?: ExcelTitleSnapshot;
}

/** A histogram's or Pareto chart's binning, read (`ChartBinOptions`). */
export interface ExcelBinOptionsSnapshot {
  /** `Category`, `Auto`, `BinWidth` or `BinCount`. */
  readonly type: string;
  readonly width?: number;
  readonly count?: number;
  readonly allowOverflow?: boolean;
  readonly overflowValue?: number;
  readonly allowUnderflow?: boolean;
  readonly underflowValue?: number;
}

/**
 * One series of a chart, read.
 *
 * The dimension arrays are exactly what `getDimensionValues` returned: strings,
 * with a blank cell as `''`. Which of them are present depends on what the
 * series is drawn as -- `xValues` and `yValues` for a scatter, `categories`
 * and `values` for everything else -- and none are read for a series the
 * reading skips.
 */
export interface ExcelSeriesSnapshot {
  readonly name: string;
  /** What the series is drawn as; the chart's type when absent. */
  readonly chartType?: string;
  /** Which value axis the series is measured on. Default `Primary`. */
  readonly axisGroup?: 'Primary' | 'Secondary';
  /** Hidden by a chart filter, so not drawn and not read. */
  readonly filtered?: boolean;
  /** A pie's first slice angle, in degrees clockwise from 12 o'clock. */
  readonly firstSliceAngle?: number;
  readonly categories?: readonly string[];
  readonly values?: readonly string[];
  readonly xValues?: readonly string[];
  readonly yValues?: readonly string[];
  /** A bubble chart's sizes, one per point. */
  readonly bubbleSizes?: readonly string[];
  /**
   * The header cell above the bubble sizes (ExcelApi 1.15), which names what
   * a bubble's size measures.
   */
  readonly sizeHeader?: string;
  /** A pie of pie's or bar of pie's split; see `ExcelChartSeries.splitType`. */
  readonly splitType?: string;
  readonly splitValue?: number;
  /** A histogram's or Pareto chart's binning. */
  readonly binOptions?: ExcelBinOptionsSnapshot;
  /** A box and whisker chart's quartile calculation, `Inclusive` or `Exclusive`. */
  readonly quartileCalculation?: string;
  /**
   * A waterfall's points set as totals, by position (Excel's *Set as total*).
   * Office.js does not report them, so a read never has them; a snapshot
   * written by hand can.
   */
  readonly totals?: readonly number[];
}

/**
 * Everything one read of a chart produced: a plain object, safe to keep,
 * compare and hand to `convertExcelChart` after the request context is gone.
 */
export interface ExcelChartSnapshot {
  /** The chart's id, unique in the workbook. */
  readonly id?: string;
  /** The chart object's name, such as `Chart 1`. */
  readonly name?: string;
  /** The name of the worksheet the chart is on. */
  readonly worksheet?: string;
  /** `Excel.ChartType`; for a combo chart, Excel reports one of its types. */
  readonly chartType: string;
  /** How a blank cell is plotted: `NotPlotted`, `Zero` or `Interplotted`. */
  readonly displayBlanksAs?: string;
  readonly title?: ExcelTitleSnapshot;
  readonly axes?: {
    readonly category?: ExcelAxisSnapshot;
    readonly value?: ExcelAxisSnapshot;
    /** Read only when a series is measured on the secondary value axis. */
    readonly secondaryValue?: ExcelAxisSnapshot;
    /** A 3-D chart's series axis; read only for a surface. */
    readonly series?: ExcelAxisSnapshot;
  };
  /** The series, in plot order, filtered ones included. */
  readonly series: readonly ExcelSeriesSnapshot[];
  /**
   * The category cells' displayed text, one label per category (ExcelApi
   * 1.15, a category range on a worksheet). Several label levels are joined,
   * outer first. Preferred over `categories` when it lines up with them.
   */
  readonly categoryLabels?: readonly string[];
  /**
   * The same cells' levels, outer first, one list per category, when the
   * category range has more than one (ExcelApi 1.15). A blank outer cell is
   * the one above it carried down, as Excel reads it. The hierarchy of a
   * treemap or sunburst.
   */
  readonly categoryLevels?: readonly (readonly string[])[];
  /**
   * The header cell above (or before) the category range (ExcelApi 1.15),
   * which names the category axis when the chart shows no axis title.
   */
  readonly categoryHeader?: string;
  /** The chart as Excel draws it, a base64-encoded PNG (`Chart.getImage`). */
  readonly image?: string;
}

/** One chart the picker offers. */
export interface ExcelChartInfo {
  /** The chart's id, unique in the workbook. */
  readonly id: string;
  /** The chart object's name, such as `Chart 1`. */
  readonly name: string;
  /** The title the chart shows, when it shows one. */
  readonly title?: string;
  readonly worksheet: string;
  readonly worksheetId: string;
  /** What the picker says: `Sheet - title`, or `Sheet - name` when untitled. */
  readonly label: string;
}

/**
 * Options for `convertExcelChart`.
 */
export interface ExcelConvertOptions {
  /** The figure id. Must be unique on the page; default `maidr-excel-<n>`. */
  readonly id?: string;
}
