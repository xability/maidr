import type {
  AnyChartAxis,
  AnyChartInstance,
  AnyChartIterator,
  AnyChartSeries,
} from '@adapters/anychart/types';
import type { BarPoint, BoxSelector, MaidrLayer } from '@type/grammar';
import {
  anyChartsToMaidr,
  anyChartToMaidr,
  bindAnyCharts,
} from '@adapters/anychart/converters';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

// ---------------------------------------------------------------------------
// DOM globals (jest runs in the node environment; the adapter resolves
// containers and stamps SVGs via DOM globals at call time).
// ---------------------------------------------------------------------------

const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  document: dom.window.document,
  window: dom.window,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Node: dom.window.Node,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: dom.window.MutationObserver,
});

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// AnyChart mocks
// ---------------------------------------------------------------------------

function createIterator(rows: Array<Record<string, unknown>>): AnyChartIterator {
  let index = -1;
  return {
    advance: () => ++index < rows.length,
    get: (field: string) => rows[index]?.[field],
    getIndex: () => index,
    getRowsCount: () => rows.length,
    reset: () => {
      index = -1;
    },
  };
}

function createSeries(
  seriesType: string,
  rows: Array<Record<string, unknown>>,
): AnyChartSeries {
  return {
    id: () => 0,
    name: () => seriesType,
    seriesType: () => seriesType,
    getIterator: () => createIterator(rows),
    getPoint: () => ({ get: () => undefined, getIndex: () => 0, exists: () => false }),
    getStat: () => undefined,
  };
}

function createBarSeries(data: Array<[string, number]>): AnyChartSeries {
  return createSeries('column', data.map(([x, value]) => ({ x, value })));
}

function createAxis(titleText: string): AnyChartAxis {
  return {
    title: () => ({ text: () => titleText }),
    labels: () => ({ enabled: () => true }),
  };
}

interface MockChartConfig {
  title?: string;
  container?: HTMLElement | string;
  series?: AnyChartSeries[];
  type?: string;
  xTitle?: string;
  yTitle?: string;
  /** Chart-level data rows (heatmap-style single-dataset charts). */
  heatRows?: Array<Record<string, unknown>>;
}

function createChart(config: MockChartConfig): AnyChartInstance {
  const series = config.series ?? [];
  const chartType = config.type;
  const heatRows = config.heatRows;
  const xTitle = config.xTitle;
  const yTitle = config.yTitle;
  return {
    title: () => config.title ?? '',
    container: () => config.container ?? '',
    getSeriesCount: () => series.length,
    getSeriesAt: (i: number) => series[i] ?? null,
    ...(chartType ? { getType: () => chartType } : {}),
    ...(heatRows
      ? { data: () => ({ getIterator: () => createIterator(heatRows) }) }
      : {}),
    ...(xTitle ? { xAxis: () => createAxis(xTitle) } : {}),
    ...(yTitle ? { yAxis: () => createAxis(yTitle) } : {}),
  };
}

function createBarChart(
  title: string,
  data: Array<[string, number]> = [['A', 1], ['B', 2]],
  extra: Omit<MockChartConfig, 'title' | 'series'> = {},
): AnyChartInstance {
  return createChart({ title, series: [createBarSeries(data)], ...extra });
}

/** Create a container div (attached to body) holding a rendered <svg>. */
function createContainerWithSvg(id: string, parent?: HTMLElement): HTMLElement {
  const container = document.createElement('div');
  container.id = id;
  const svg = document.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  (parent ?? document.body).appendChild(container);
  return container;
}

function stubRect(
  el: HTMLElement,
  rect: { top: number; left: number; width?: number; height?: number },
): void {
  const width = rect.width ?? 100;
  const height = rect.height ?? 100;
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      left: rect.left,
      width,
      height,
      right: rect.left + width,
      bottom: rect.top + height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

function firstLayer(maidr: NonNullable<ReturnType<typeof anyChartsToMaidr>>, r: number, c: number): MaidrLayer {
  return maidr.subplots[r][c].layers[0];
}

// Silence the adapter's diagnostic warnings so test output stays readable.
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Single-panel behavior (must remain EXACTLY as before)
// ---------------------------------------------------------------------------

describe('anyChartToMaidr (single panel, unchanged)', () => {
  it('emits a 1x1 grid with un-prefixed selectors and layer ids', () => {
    const chart = createBarChart('Tips', [['Sat', 87], ['Sun', 76]], {
      xTitle: 'Day',
      yTitle: 'Count',
    });

    const result = anyChartToMaidr(chart);

    expect(result).not.toBeNull();
    expect(result?.id).toBe('anychart-maidr');
    expect(result?.title).toBe('Tips');
    expect(result?.subplots).toHaveLength(1);
    expect(result?.subplots[0]).toHaveLength(1);

    const subplot = result!.subplots[0][0];
    // Single-panel subplots carry no panel selector.
    expect(subplot.selector).toBeUndefined();

    const layer = subplot.layers[0];
    expect(layer.id).toBe('0');
    expect(layer.type).toBe(TraceType.BAR);
    // No panel-token scoping in single-panel mode.
    expect(layer.selectors).toBe('[data-maidr-anychart-bar^="0-"]');
    // Layer titles are not set in single-panel mode.
    expect(layer.title).toBeUndefined();
    expect(layer.axes?.x).toEqual({ label: 'Day' });
    expect(layer.axes?.y).toEqual({ label: 'Count' });

    const data = layer.data as BarPoint[];
    expect(data).toEqual([{ x: 'Sat', y: 87 }, { x: 'Sun', y: 76 }]);
  });

  it('returns null for a chart with no convertible series', () => {
    const chart = createChart({ series: [createSeries('pie', [{ x: 'A', value: 1 }])] });
    expect(anyChartToMaidr(chart)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-panel conversion
// ---------------------------------------------------------------------------

describe('anyChartsToMaidr', () => {
  it('maps an explicit 2D grid 1:1 onto subplots (ragged rows allowed)', () => {
    const a = createBarChart('Panel A');
    const b = createBarChart('Panel B');
    const c = createBarChart('Panel C');

    const result = anyChartsToMaidr([[a, b], [c]], { id: 'fig', title: 'Figure' });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('fig');
    expect(result?.title).toBe('Figure');
    expect(result?.subplots).toHaveLength(2);
    expect(result?.subplots[0]).toHaveLength(2);
    expect(result?.subplots[1]).toHaveLength(1);

    // First layer's title is the panel display name.
    expect(firstLayer(result!, 0, 0).title).toBe('Panel A');
    expect(firstLayer(result!, 0, 1).title).toBe('Panel B');
    expect(firstLayer(result!, 1, 0).title).toBe('Panel C');

    // Layer ids are unique across the whole figure.
    const ids = result!.subplots.flat().flatMap(s => s.layers.map(l => l.id));
    expect(ids).toEqual(['0_0_0', '0_1_0', '1_0_0']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('scopes every selector to its own panel token', () => {
    const a = createBarChart('A');
    const b = createBarChart('B');

    const result = anyChartsToMaidr([[a, b]], { id: 'fig' });

    expect(result?.subplots[0][0].selector).toBe(
      'svg[data-maidr-anychart-panel="fig-0-0"]',
    );
    expect(result?.subplots[0][1].selector).toBe(
      'svg[data-maidr-anychart-panel="fig-0-1"]',
    );
    expect(firstLayer(result!, 0, 0).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] [data-maidr-anychart-bar^="fig-0-0:0-"]',
    );
    expect(firstLayer(result!, 0, 1).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-1"] [data-maidr-anychart-bar^="fig-0-1:0-"]',
    );
  });

  it('scopes BoxSelector entries and candlestick defaults to the panel', () => {
    const box = createChart({
      title: 'Box',
      series: [
        createSeries('box', [
          { x: 'A', lowest: 1, q1: 2, median: 3, q3: 4, highest: 5 },
        ]),
      ],
    });
    const candle = createChart({
      title: 'Candle',
      series: [
        createSeries('candlestick', [
          { x: 'Mon', open: 1, high: 4, low: 0.5, close: 3 },
        ]),
      ],
    });

    const result = anyChartsToMaidr([[box, candle]], { id: 'fig' });

    const boxSelectors = firstLayer(result!, 0, 0).selectors as BoxSelector[];
    expect(boxSelectors).toHaveLength(1);
    expect(boxSelectors[0].iq).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-box="fig-0-0:0-0"][data-maidr-anychart-box-part="iq"]',
    );
    expect(boxSelectors[0].q2).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] '
      + '[data-maidr-anychart-box="fig-0-0:0-0"][data-maidr-anychart-box-part="q2"]',
    );

    expect(firstLayer(result!, 0, 1).type).toBe(TraceType.CANDLESTICK);
    expect(firstLayer(result!, 0, 1).selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-1"] '
      + '[data-maidr-anychart-candlestick-cell^="fig-0-1:0-"]',
    );
  });

  it('scopes heatmap panels to the panel token', () => {
    const heat = createChart({
      title: 'Heat',
      type: 'heat-map',
      heatRows: [
        { x: 'X1', y: 'Y1', heat: 1 },
        { x: 'X2', y: 'Y1', heat: 2 },
      ],
    });
    const bar = createBarChart('Bar');

    const result = anyChartsToMaidr([[heat, bar]], { id: 'fig' });

    const heatLayer = firstLayer(result!, 0, 0);
    expect(heatLayer.type).toBe(TraceType.HEATMAP);
    expect(heatLayer.id).toBe('0_0_0');
    expect(heatLayer.title).toBe('Heat');
    expect(heatLayer.selectors).toBe(
      '[data-maidr-anychart-panel="fig-0-0"] [data-maidr-anychart-heatmap-cell]',
    );
  });

  it('applies figure-level axes overrides but keeps per-panel extraction otherwise', () => {
    const a = createBarChart('A', [['x', 1]], { xTitle: 'AX', yTitle: 'AY' });
    const b = createBarChart('B', [['x', 1]], { xTitle: 'BX', yTitle: 'BY' });

    const extracted = anyChartsToMaidr([[a, b]], { id: 'fig' });
    expect(firstLayer(extracted!, 0, 0).axes?.x).toEqual({ label: 'AX' });
    expect(firstLayer(extracted!, 0, 1).axes?.x).toEqual({ label: 'BX' });

    const overridden = anyChartsToMaidr([[a, b]], {
      id: 'fig2',
      axes: { x: 'Shared X', y: 'Shared Y' },
    });
    expect(firstLayer(overridden!, 0, 0).axes?.x).toEqual({ label: 'Shared X' });
    expect(firstLayer(overridden!, 0, 1).axes?.y).toEqual({ label: 'Shared Y' });
  });

  it('sanitizes CSS-hostile figure ids in panel tokens but not in the figure id', () => {
    const result = anyChartsToMaidr([[createBarChart('A')]], { id: 'my "fig" 1' });
    expect(result?.id).toBe('my "fig" 1');
    expect(result?.subplots[0][0].selector).toBe(
      'svg[data-maidr-anychart-panel="my__fig__1-0-0"]',
    );
  });

  it('drops panels with no convertible series, keeping original tokens', () => {
    const bad = createChart({ series: [createSeries('pie', [{ x: 'A', value: 1 }])] });
    const good = createBarChart('Good');

    const result = anyChartsToMaidr([[bad, good]], { id: 'fig' });

    expect(result?.subplots).toHaveLength(1);
    expect(result?.subplots[0]).toHaveLength(1);
    // Token still reflects the ORIGINAL grid position (0, 1).
    expect(result?.subplots[0][0].selector).toBe(
      'svg[data-maidr-anychart-panel="fig-0-1"]',
    );
  });

  it('returns null when no panel is convertible', () => {
    const bad = createChart({ series: [createSeries('pie', [{ x: 'A', value: 1 }])] });
    expect(anyChartsToMaidr([[bad]], { id: 'fig' })).toBeNull();
  });

  describe('input validation', () => {
    it('rejects an empty charts array', () => {
      expect(anyChartsToMaidr([], { id: 'fig' })).toBeNull();
    });

    it('rejects grids containing an empty row', () => {
      expect(anyChartsToMaidr([[createBarChart('A')], []], { id: 'fig' })).toBeNull();
    });

    it('rejects mixed flat/2D input', () => {
      const a = createBarChart('A');
      const b = createBarChart('B');
      expect(
        anyChartsToMaidr([a, [b]] as unknown as AnyChartInstance[][], { id: 'fig' }),
      ).toBeNull();
    });
  });

  describe('flat-array layouts', () => {
    it('defaults to a single row when no layout is given', () => {
      const charts = [createBarChart('A'), createBarChart('B'), createBarChart('C')];
      const result = anyChartsToMaidr(charts, { id: 'fig' });
      expect(result?.subplots).toHaveLength(1);
      expect(result?.subplots[0]).toHaveLength(3);
    });

    it('chunks row-major by columns', () => {
      const charts = [createBarChart('A'), createBarChart('B'), createBarChart('C')];
      const result = anyChartsToMaidr(charts, { id: 'fig', layout: { columns: 2 } });
      expect(result?.subplots).toHaveLength(2);
      expect(result?.subplots[0]).toHaveLength(2);
      expect(result?.subplots[1]).toHaveLength(1);
      expect(firstLayer(result!, 0, 0).title).toBe('A');
      expect(firstLayer(result!, 0, 1).title).toBe('B');
      expect(firstLayer(result!, 1, 0).title).toBe('C');
    });

    it('derives columns from rows when only rows is given', () => {
      const charts = [
        createBarChart('A'),
        createBarChart('B'),
        createBarChart('C'),
        createBarChart('D'),
      ];
      const result = anyChartsToMaidr(charts, { id: 'fig', layout: { rows: 2 } });
      expect(result?.subplots).toHaveLength(2);
      expect(result?.subplots[0]).toHaveLength(2);
      expect(result?.subplots[1]).toHaveLength(2);
    });

    it('arranges layout "auto" by container position (rows by top, columns by left)', () => {
      const wrapper = document.createElement('div');
      document.body.appendChild(wrapper);
      const topLeft = createContainerWithSvg('auto-tl', wrapper);
      const topRight = createContainerWithSvg('auto-tr', wrapper);
      const bottomLeft = createContainerWithSvg('auto-bl', wrapper);
      stubRect(topLeft, { top: 0, left: 0 });
      stubRect(topRight, { top: 3, left: 200 }); // within row tolerance of top: 0
      stubRect(bottomLeft, { top: 300, left: 0 });

      // Pass charts in shuffled order; 'auto' must sort them visually.
      const charts = [
        createBarChart('BottomLeft', [['x', 1]], { container: bottomLeft }),
        createBarChart('TopRight', [['x', 1]], { container: topRight }),
        createBarChart('TopLeft', [['x', 1]], { container: topLeft }),
      ];

      const result = anyChartsToMaidr(charts, { id: 'fig', layout: 'auto' });

      expect(result?.subplots).toHaveLength(2);
      expect(result?.subplots[0]).toHaveLength(2);
      expect(result?.subplots[1]).toHaveLength(1);
      expect(firstLayer(result!, 0, 0).title).toBe('TopLeft');
      expect(firstLayer(result!, 0, 1).title).toBe('TopRight');
      expect(firstLayer(result!, 1, 0).title).toBe('BottomLeft');
      wrapper.remove();
    });

    it('fails layout "auto" when a chart has no resolvable container', () => {
      const charts = [createBarChart('A'), createBarChart('B')];
      expect(anyChartsToMaidr(charts, { id: 'fig', layout: 'auto' })).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// bindAnyCharts (DOM integration)
// ---------------------------------------------------------------------------

describe('bindAnyCharts', () => {
  it('stamps panel tokens, wraps the panels in one host, and binds once', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const container1 = createContainerWithSvg('bind-p1', wrapper);
    const container2 = createContainerWithSvg('bind-p2', wrapper);

    const chartA = createBarChart('A', [['x', 1]], { container: container1 });
    const chartB = createBarChart('B', [['x', 2]], { container: container2 });

    const events: unknown[] = [];
    const listener = (e: Event): void => {
      events.push((e as CustomEvent).detail);
    };
    document.addEventListener('maidr:bindchart', listener);

    const maidr = bindAnyCharts([[chartA, chartB]], { id: 'fig', title: 'Fig' });

    expect(maidr).not.toBeNull();
    expect(maidr?.subplots[0]).toHaveLength(2);

    // Each panel's own SVG carries its token.
    expect(container1.querySelector('svg')?.getAttribute('data-maidr-anychart-panel'))
      .toBe('fig-0-0');
    expect(container2.querySelector('svg')?.getAttribute('data-maidr-anychart-panel'))
      .toBe('fig-0-1');

    // One host wraps BOTH panel containers and carries the combined data.
    const host = document.querySelector<HTMLElement>('[data-maidr-anychart-host]');
    expect(host).not.toBeNull();
    expect(host?.contains(container1)).toBe(true);
    expect(host?.contains(container2)).toBe(true);
    const parsed = JSON.parse(host?.getAttribute('maidr-data') ?? 'null');
    expect(parsed?.id).toBe('fig');
    expect(parsed?.subplots?.[0]).toHaveLength(2);

    // Exactly one bind event for the whole figure.
    expect(events).toHaveLength(1);

    // Re-binding is a no-op that returns the data again.
    const again = bindAnyCharts([[chartA, chartB]], { id: 'fig' });
    expect(again).not.toBeNull();
    expect(events).toHaveLength(1);

    document.removeEventListener('maidr:bindchart', listener);
    host?.remove();
  });

  it('resolves every emitted subplot selector to its own panel SVG (visual-layout contract)', () => {
    // The MAIDR core computes visual panel order and vertical arrow
    // direction (resolveSubplotLayout's panel-geometry pass) by measuring
    // the element matched by each subplot's `selector`. This asserts the
    // adapter's multi-ROW output satisfies that contract: every subplot
    // carries a selector that resolves to that panel's own, distinct SVG.
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const containers = [
      createContainerWithSvg('layout-p00', wrapper),
      createContainerWithSvg('layout-p01', wrapper),
      createContainerWithSvg('layout-p10', wrapper),
      createContainerWithSvg('layout-p11', wrapper),
    ];
    const charts = containers.map(
      (container, i) => createBarChart(`P${i}`, [['x', i + 1]], { container }),
    );

    const maidr = bindAnyCharts(
      [[charts[0], charts[1]], [charts[2], charts[3]]],
      { id: 'layout-fig' },
    );

    expect(maidr).not.toBeNull();
    expect(maidr?.subplots).toHaveLength(2);

    const resolved: Element[] = [];
    maidr!.subplots.forEach((row, r) => {
      row.forEach((subplot, c) => {
        expect(subplot.selector).toBe(
          `svg[data-maidr-anychart-panel="layout-fig-${r}-${c}"]`,
        );
        const el = document.querySelector(subplot.selector!);
        expect(el).toBe(containers[r * 2 + c].querySelector('svg'));
        resolved.push(el!);
        // The first layer's selector is scoped inside the same panel, so the
        // core's layer-selector fallback also stays within the panel.
        expect(subplot.layers[0].selectors).toBe(
          `[data-maidr-anychart-panel="layout-fig-${r}-${c}"] `
          + `[data-maidr-anychart-bar^="layout-fig-${r}-${c}:0-"]`,
        );
      });
    });
    // Four panels, four DISTINCT elements to measure.
    expect(new Set(resolved).size).toBe(4);

    document.querySelector('[data-maidr-anychart-host]')?.remove();
  });

  it('preserves page order when other content is interleaved between panels', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const container1 = createContainerWithSvg('inter-p1', wrapper);
    const heading = document.createElement('h3');
    heading.textContent = 'Q2 sales';
    wrapper.appendChild(heading);
    const container2 = createContainerWithSvg('inter-p2', wrapper);

    const chartA = createBarChart('A', [['x', 1]], { container: container1 });
    const chartB = createBarChart('B', [['x', 2]], { container: container2 });

    const maidr = bindAnyCharts([[chartA, chartB]], { id: 'inter-fig' });

    expect(maidr).not.toBeNull();

    // Non-contiguous same-parent panels must NOT be pulled together past the
    // heading; the shared parent is wrapped in place instead.
    expect(Array.from(wrapper.children)).toEqual([container1, heading, container2]);
    const host = wrapper.parentElement;
    expect(host?.hasAttribute('data-maidr-anychart-host')).toBe(true);
    expect(host?.contains(container1)).toBe(true);
    expect(host?.contains(container2)).toBe(true);
    expect(host?.getAttribute('maidr-data')).toBeTruthy();

    host?.remove();
  });

  it('returns the originally bound Maidr on re-bind without an explicit id', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const container1 = createContainerWithSvg('rebind-p1', wrapper);
    const container2 = createContainerWithSvg('rebind-p2', wrapper);

    const chartA = createBarChart('A', [['x', 1]], { container: container1 });
    const chartB = createBarChart('B', [['x', 2]], { container: container2 });

    const first = bindAnyCharts([[chartA, chartB]]);
    expect(first).not.toBeNull();

    // Second call without options.id would mint a fresh generated id whose
    // panel tokens were never stamped; the reuse path must return the
    // Maidr the DOM was actually bound with.
    const again = bindAnyCharts([[chartA, chartB]]);
    expect(again).toBe(first);

    // The returned object's selectors resolve against the stamped DOM.
    expect(document.querySelector(again!.subplots[0][0].selector!))
      .toBe(container1.querySelector('svg'));
    expect(document.querySelector(again!.subplots[0][1].selector!))
      .toBe(container2.querySelector('svg'));

    document.querySelector('[data-maidr-anychart-host]')?.remove();
  });

  it('refuses charts sharing one container (shared-Stage dashboards)', () => {
    const container = createContainerWithSvg('bind-shared');
    const chartA = createBarChart('A', [['x', 1]], { container });
    const chartB = createBarChart('B', [['x', 2]], { container });

    expect(bindAnyCharts([[chartA, chartB]], { id: 'fig' })).toBeNull();
    container.remove();
  });

  it('fails when a chart has no container', () => {
    const container = createContainerWithSvg('bind-solo');
    const chartA = createBarChart('A', [['x', 1]], { container });
    const chartB = createBarChart('B');

    expect(bindAnyCharts([[chartA, chartB]], { id: 'fig' })).toBeNull();
    container.remove();
  });
});
