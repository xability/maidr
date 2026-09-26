/**
 * Fake ApexCharts instances and SVG fixtures for the adapter tests.
 *
 * The adapter reads only the structural types in `@adapters/apexcharts/types`,
 * so a test builds a plain object with the `w.globals` / `w.config` shapes
 * ApexCharts 7.6.0 produces — measured in a browser — and, where selectors
 * matter, the SVG it draws: the wrapper `div#apexcharts<chartID>`, series
 * groups carrying `data:realIndex` in ApexCharts' own document order (which
 * is not series order for heat maps, stacked areas and combo charts), and
 * the look-alikes a selector must not pick up: legend swatches with the
 * `apexcharts-marker` class and the hover placeholder marker with no `j`.
 *
 * Tests using these helpers run under jsdom (`@jest-environment jsdom`).
 */

import type {
  ApexChartsInstance,
  ApexConfig,
  ApexEventHandler,
  ApexGlobals,
  ApexSeriesOption,
  ApexValue,
} from '@adapters/apexcharts/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

let chartCounter = 0;

/** Attributes for {@link svg}. */
type Attrs = Record<string, string | number | null | undefined>;

/**
 * Creates an SVG element, optionally appended to a parent.
 *
 * @param tag    - The tag name
 * @param attrs  - Attributes; null and undefined are skipped
 * @param parent - Where to append it
 * @returns The element
 */
export function svg(tag: string, attrs: Attrs = {}, parent?: Element): SVGElement {
  const element = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined) {
      element.setAttribute(name, String(value));
    }
  }
  parent?.appendChild(element);
  return element;
}

/** The DOM of a fake chart, for fixtures to draw into. */
export interface FakeDom {
  /** The user's container, `chart.el`. */
  el: HTMLElement;
  /** `div#apexcharts<id>.apexcharts-canvas`. */
  wrap: HTMLElement;
  /** `svg.apexcharts-svg`. */
  svg: SVGElement;
  /** `g.apexcharts-inner.apexcharts-graphical`. */
  inner: SVGElement;
  /** Adds a series group in document order. */
  series: (realIndex: number, plotClass?: string) => SVGElement;
}

/**
 * Builds the container, wrapper, svg and legend ApexCharts draws for every
 * chart, and attaches it to the document.
 *
 * @param chartID      - The chart id
 * @param legendNames  - Legend entries to draw, each with a marker swatch
 * @returns The DOM handles
 */
export function fakeDom(chartID: string, legendNames: string[] = []): FakeDom {
  const el = document.createElement('div');
  el.id = `container-${chartID}`;
  document.body.appendChild(el);

  const wrap = document.createElement('div');
  wrap.id = `apexcharts${chartID}`;
  wrap.className = `apexcharts-canvas apexcharts${chartID}`;
  el.appendChild(wrap);

  const root = svg('svg', { class: 'apexcharts-svg' }, wrap);
  const inner = svg('g', { class: 'apexcharts-inner apexcharts-graphical' }, root);

  // The legend's swatches carry `apexcharts-marker` too.
  const legend = document.createElement('div');
  legend.className = 'apexcharts-legend';
  wrap.appendChild(legend);
  legendNames.forEach((name, k) => {
    const swatch = svg('svg', {}, legend);
    svg('path', { class: 'apexcharts-legend-marker apexcharts-marker', rel: k + 1, d: 'M 0 0' }, swatch);
  });

  const plots = new Map<string, SVGElement>();
  return {
    el,
    wrap,
    svg: root,
    inner,
    series: (realIndex: number, plotClass = 'apexcharts-bar-series'): SVGElement => {
      let plot = plots.get(plotClass);
      if (!plot) {
        plot = svg('g', { class: `${plotClass} apexcharts-plot-series` }, inner);
        plots.set(plotClass, plot);
      }
      return svg('g', {
        'class': 'apexcharts-series',
        'rel': 1,
        'seriesName': 'x',
        'data:realIndex': realIndex,
      }, plot);
    },
  };
}

/** One series of a fake chart. */
export interface FakeSeries {
  name?: string;
  type?: string;
  values: ApexValue[];
  /** The series' own x values (numeric or datetime axes). */
  x?: (number | string)[];
  /** The data as the author wrote it, for `chart.opts`. */
  written?: unknown[];
}

/** Input to {@link fakeChart}. */
export interface FakeChartInput {
  type: string;
  series?: FakeSeries[];
  /** Flat values, for pie-like charts. */
  slices?: (number | null)[];
  labels?: (string | number)[];
  categoryLabels?: (string | number)[];
  isXNumeric?: boolean;
  config?: Partial<ApexConfig>;
  chartOptions?: Partial<ApexConfig['chart']>;
  globals?: Partial<ApexGlobals>;
  chartID?: string;
  /**
   * Draws the chart's marks into its DOM. Without it the chart has no DOM at
   * all, as before `render()`, and the adapter checks nothing against it.
   */
  draw?: (dom: FakeDom) => void;
}

/** A fake chart plus the handles its tests use. */
export interface FakeChart extends ApexChartsInstance {
  dom: FakeDom | null;
  /** Fires a chart event, as ApexCharts' `fireEvent` does. */
  fire: (name: string) => void;
  /** Registered handlers, by event. */
  handlers: Map<string, ApexEventHandler[]>;
}

/**
 * Builds a fake ApexCharts instance.
 *
 * @param input - What the chart holds
 * @returns The fake
 */
export function fakeChart(input: FakeChartInput): FakeChart {
  chartCounter += 1;
  const chartID = input.chartID ?? `fake${chartCounter}`;
  const series = input.series ?? [];
  const seriesOptions: ApexSeriesOption[] = series.map(s => ({
    name: s.name,
    type: s.type,
    data: s.written ?? s.values,
  }));

  const globals: ApexGlobals = {
    chartID,
    series: input.slices ?? series.map(s => s.values),
    seriesX: series.map(s => s.x ?? []),
    seriesNames: series.map((s, i) => s.name ?? `series-${i + 1}`),
    labels: input.labels ?? [],
    categoryLabels: input.categoryLabels ?? [],
    isXNumeric: input.isXNumeric ?? false,
    initialSeries: seriesOptions,
    collapsedSeries: [],
    collapsedSeriesIndices: [],
    animationEnded: true,
    ...input.globals,
  };

  const config: ApexConfig = {
    chart: {
      type: input.type,
      animations: { enabled: false },
      accessibility: { enabled: false },
      ...input.chartOptions,
    },
    series: seriesOptions,
    title: {},
    subtitle: {},
    xaxis: { title: {} },
    yaxis: [{ title: {} }],
    ...input.config,
  };

  let dom: FakeDom | null = null;
  let el: HTMLElement;
  if (!input.draw) {
    el = document.createElement('div');
    document.body.appendChild(el);
  } else {
    dom = fakeDom(chartID, series.map(s => s.name ?? ''));
    input.draw(dom);
    el = dom.el;
  }

  const handlers = new Map<string, ApexEventHandler[]>();
  return {
    el,
    dom,
    handlers,
    w: { globals, config, dom: { elWrap: dom?.wrap ?? null } },
    opts: { series: input.slices ?? seriesOptions },
    addEventListener: (name: string, handler: ApexEventHandler): void => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    removeEventListener: (name: string, handler: ApexEventHandler): void => {
      handlers.set(name, (handlers.get(name) ?? []).filter(h => h !== handler));
    },
    fire: (name: string): void => {
      (handlers.get(name) ?? []).forEach(handler => handler());
    },
  };
}

/**
 * Draws a bar series: one `path.apexcharts-bar-area` per point, a null one
 * included (ApexCharts draws it at zero size, without `val`).
 *
 * @param group  - The series group
 * @param values - The values
 * @param realIndex - The series' index, written to `index`
 */
export function drawBars(group: Element, values: ApexValue[], realIndex: number): void {
  values.forEach((value, j) => {
    svg('path', {
      class: 'apexcharts-bar-area',
      index: realIndex,
      j,
      val: value ?? undefined,
      d: `M ${j} 0 L ${j} 1`,
    }, group);
  });
}

/**
 * Draws a line or area series' markers group, one marker per non-null point.
 *
 * @param group  - The series group
 * @param values - The values
 * @param placeholder - Also draw the hover placeholder (no `j`), as
 *   ApexCharts does inside the first series' markers group
 */
export function drawMarkers(group: Element, values: ApexValue[], placeholder = false): void {
  const markers = svg('g', { class: 'apexcharts-series-markers-wrap' }, group);
  const inner = svg('g', { class: 'apexcharts-series-markers' }, markers);
  values.forEach((value, j) => {
    if (value !== null && value !== undefined) {
      svg('path', { class: 'apexcharts-marker', j, rel: j, d: `M ${j} ${value}` }, inner);
    }
  });
  if (placeholder) {
    svg('path', { class: 'apexcharts-marker', d: 'M 0 0' }, inner);
  }
}

/**
 * The elements a selector matches, in the whole document.
 *
 * @param selector - The selector
 * @returns The matches
 */
export function matches(selector: string): Element[] {
  return [...document.querySelectorAll(selector)];
}
