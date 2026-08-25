/**
 * Minimal type declarations for the Apache ECharts API.
 *
 * These cover only the subset the MAIDR ECharts adapter reads. ECharts is
 * loaded as a peer dependency or a CDN script and is not installed in this
 * repo, so nothing here is imported from the package -- the shapes were
 * measured against **echarts 6.1.0** driven in Chromium rather than copied
 * from its published types, and the fields declared are exactly the ones a
 * reading was proven to need.
 *
 * @see https://echarts.apache.org/
 */

/**
 * The series types this adapter reads.
 *
 * ECharts draws seventeen. Three are the cartesian ones (tier 1 of
 * xability/maidr#1195) and three carry one magnitude per named thing (tier
 * 2a). Every other series type is refused by name so that gaining a reading
 * later is a decision rather than an accident.
 *
 * Kept in step with `READ` in `converters.ts`, which is what actually decides
 * -- this type is the public statement of it.
 */
export type EChartsSeriesType
  = | 'bar'
    | 'line'
    | 'scatter'
    | 'pie'
    | 'funnel'
    | 'gauge';

/**
 * One column of a series' internal data list.
 *
 * Measured: a cartesian series carries `['x', 'y']`, and a scatter whose
 * `symbolSize` reads a third column carries `['x', 'y', 'value']`.
 */
export type EChartsDimension = string;

/**
 * A series' data list.
 *
 * Addressed by index rather than iterated, which is what lets a reading walk
 * it in the order the chart drew it.
 */
export interface EChartsList {
  /** The column names, in order. */
  dimensions: EChartsDimension[];
  /** How many data points the series holds. */
  count: () => number;
  /**
   * The category name at `index`.
   *
   * Measured: the category axis' label on a category axis, and the empty
   * string on a value axis -- so an empty name means "this axis carries
   * numbers", not "this point is unnamed".
   */
  getName: (index: number) => string;
  /**
   * The value of one dimension at `index`.
   *
   * On a category axis this is the category's **index**, not its name; the
   * name comes from {@link getName}.
   */
  get: (dimension: EChartsDimension, index: number) => number | null | undefined;
}

/**
 * One series of a rendered chart.
 */
export interface EChartsSeriesModel {
  /** The declared series type -- `'bar'`, `'line'`, `'scatter'`, … */
  subType: string;
  /**
   * The series' resolved name.
   *
   * ECharts invents one (`'series 0'`, with a NUL separator) when the author
   * supplied none, so a name is only worth emitting when the author wrote it;
   * see `authoredName` in the converters.
   */
  name: string;
  /** The series' data list. */
  getData: () => EChartsList;
  /** Read one of the series' resolved options. */
  get: (key: string) => unknown;
}

/**
 * One axis, legend or title of a rendered chart.
 */
export interface EChartsComponentModel {
  /** Read one of the component's resolved options. */
  get: (key: string) => unknown;
}

/**
 * A rendered chart's resolved model.
 */
export interface EChartsModel {
  /** Visit every series, in declaration order. */
  eachSeries: (
    callback: (series: EChartsSeriesModel, index: number) => void,
  ) => void;
  /** Visit every component of one main type, in declaration order. */
  eachComponent: (
    query: { mainType: string },
    callback: (component: EChartsComponentModel, index: number) => void,
  ) => void;
}

/**
 * A rendered ECharts instance.
 *
 * Only `getModel` is read. `getZr()` and `dispatchAction()` are deliberately
 * not declared: the first exposes no element-to-DOM-node mapping in the
 * production build, and the second is ECharts' own highlighting, which
 * `MaidrLayer.selectors` has no way to call (#1195).
 */
export interface EChartsInstance {
  getModel: () => EChartsModel;
}
