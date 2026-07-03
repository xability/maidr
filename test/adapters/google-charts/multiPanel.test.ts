import type {
  GoogleChartPanel,
  GoogleChartsGridOptions,
} from '@adapters/google-charts/converters';
import type {
  GoogleBoundingBox,
  GoogleChart,
  GoogleDataTable,
  GoogleEvents,
} from '@adapters/google-charts/types';
import type { BarPoint } from '@type/grammar';
import {
  createMaidrFromGoogleChart,
  createMaidrFromGoogleCharts,
  whenGoogleChartsReady,
} from '@adapters/google-charts/converters';
import { describe, expect, it, jest } from '@jest/globals';
import { TraceType } from '@type/grammar';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

type BarRow = [string, number];

/** Minimal DataTable fake for a two-column (label, value) bar chart. */
function makeBarDataTable(rows: BarRow[], labels: [string, string] = ['Day', 'Tips']): GoogleDataTable {
  return {
    getNumberOfRows: () => rows.length,
    getNumberOfColumns: () => 2,
    getValue: (r, c) => rows[r][c],
    getFormattedValue: (r, c) => String(rows[r][c]),
    getColumnLabel: c => labels[c],
    getColumnType: c => (c === 0 ? 'string' : 'number'),
  };
}

/**
 * Builds one rendered bar-chart panel: a container div (appended to `parent`)
 * holding an SVG with one rect per data row, plus a chart fake whose layout
 * interface reports bounding boxes matching those rects.
 */
function makeBarPanel(
  doc: Document,
  parent: HTMLElement,
  rows: BarRow[],
  title?: string,
  labels?: [string, string],
): GoogleChartPanel {
  const container = doc.createElement('div');
  parent.appendChild(container);

  const svg = doc.createElementNS(SVG_NS, 'svg');
  container.appendChild(svg);
  const group = doc.createElementNS(SVG_NS, 'g');
  group.setAttribute('clip-path', 'url(#clip)');
  svg.appendChild(group);

  const bboxes = new Map<string, GoogleBoundingBox>();
  rows.forEach(([, value], i) => {
    const bbox: GoogleBoundingBox = { left: i * 30, top: 100 - value, width: 20, height: value };
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(bbox.left));
    rect.setAttribute('y', String(bbox.top));
    rect.setAttribute('width', String(bbox.width));
    rect.setAttribute('height', String(bbox.height));
    group.appendChild(rect);
    bboxes.set(`bar#0#${i}`, bbox);
  });

  const chart: GoogleChart = {
    getSelection: () => [],
    setSelection: () => {},
    getChartLayoutInterface: () => ({
      getBoundingBox: id => bboxes.get(id) ?? null,
      getXLocation: () => 0,
      getYLocation: () => 0,
    }),
  };

  return {
    chart,
    dataTable: makeBarDataTable(rows, labels),
    container,
    chartType: 'ColumnChart',
    ...(title ? { title } : {}),
  };
}

/** Creates a fresh document with a `root` wrapper for panel containers. */
function makeRoot(): { doc: Document; root: HTMLElement } {
  const dom = new JSDOM('<!doctype html><body><div id="grid"></div></body>');
  const doc = dom.window.document as Document;
  const root = doc.getElementById('grid') as HTMLElement;
  return { doc, root };
}

/** Stubs `getBoundingClientRect` so geometry-based row clustering can run in jsdom. */
function mockRect(el: HTMLElement, top: number, left: number): void {
  el.getBoundingClientRect = () => ({
    top,
    left,
    right: left + 100,
    bottom: top + 100,
    width: 100,
    height: 100,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
}

const ROWS_A: BarRow[] = [['Sat', 40], ['Sun', 60]];
const ROWS_B: BarRow[] = [['Sat', 10], ['Sun', 20], ['Mon', 30]];

describe('createMaidrFromGoogleCharts', () => {
  it('uses a 2D panel array directly as the subplot grid, allowing ragged rows', () => {
    const { doc, root } = makeRoot();
    const panels = [
      [makeBarPanel(doc, root, ROWS_A), makeBarPanel(doc, root, ROWS_B)],
      [makeBarPanel(doc, root, ROWS_A)],
    ];

    const maidr = createMaidrFromGoogleCharts(panels, { root });

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(1);
    expect(maidr.subplots[0][0].layers).toHaveLength(1);
    expect(maidr.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
  });

  it('chunks a flat panel array row-major with layout.columns', () => {
    const { doc, root } = makeRoot();
    const panels = [
      makeBarPanel(doc, root, ROWS_A, 'A'),
      makeBarPanel(doc, root, ROWS_A, 'B'),
      makeBarPanel(doc, root, ROWS_A, 'C'),
    ];

    const maidr = createMaidrFromGoogleCharts(panels, { root, layout: { columns: 2 } });

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(1);
    expect(maidr.subplots[1][0].layers[0].title).toBe('C');
  });

  it('derives columns from layout.rows when columns is omitted', () => {
    const { doc, root } = makeRoot();
    const panels = [
      makeBarPanel(doc, root, ROWS_A, 'A'),
      makeBarPanel(doc, root, ROWS_A, 'B'),
      makeBarPanel(doc, root, ROWS_A, 'C'),
      makeBarPanel(doc, root, ROWS_A, 'D'),
    ];

    const maidr = createMaidrFromGoogleCharts(panels, { root, layout: { rows: 2 } });

    expect(maidr.subplots).toHaveLength(2);
    expect(maidr.subplots[0]).toHaveLength(2);
    expect(maidr.subplots[1]).toHaveLength(2);
    expect(maidr.subplots[1][0].layers[0].title).toBe('C');
  });

  it('infers the grid from container geometry when no layout is given', () => {
    const { doc, root } = makeRoot();
    // Provide panels out of reading order; geometry should reorder them.
    const bottomRight = makeBarPanel(doc, root, ROWS_A, 'bottom-right');
    const topRight = makeBarPanel(doc, root, ROWS_A, 'top-right');
    const topLeft = makeBarPanel(doc, root, ROWS_A, 'top-left');
    const bottomLeft = makeBarPanel(doc, root, ROWS_A, 'bottom-left');
    mockRect(topLeft.container, 0, 0);
    mockRect(topRight.container, 3, 200); // within row tolerance of topLeft
    mockRect(bottomLeft.container, 300, 0);
    mockRect(bottomRight.container, 300, 200);

    const maidr = createMaidrFromGoogleCharts(
      [bottomRight, topRight, topLeft, bottomLeft],
      { root },
    );

    expect(maidr.subplots).toHaveLength(2);
    const titles = maidr.subplots.map(row => row.map(subplot => subplot.layers[0].title));
    expect(titles).toEqual([
      ['top-left', 'top-right'],
      ['bottom-left', 'bottom-right'],
    ]);
  });

  it('scopes each panel to its own container: unique ids, layer selectors, and subplot selector', () => {
    const { doc, root } = makeRoot();
    const panelA = makeBarPanel(doc, root, ROWS_A);
    const panelB = makeBarPanel(doc, root, ROWS_B);

    const maidr = createMaidrFromGoogleCharts([[panelA, panelB]], { root });

    const idA = panelA.container.id;
    const idB = panelB.container.id;
    expect(idA).toBeTruthy();
    expect(idB).toBeTruthy();
    expect(idA).not.toBe(idB);

    expect(maidr.subplots[0][0].selector).toBe(`#${idA} svg`);
    expect(maidr.subplots[0][1].selector).toBe(`#${idB} svg`);
    expect(maidr.subplots[0][0].layers[0].selectors).toBe(`#${idA} svg rect[data-maidr-bar]`);
    expect(maidr.subplots[0][1].layers[0].selectors).toBe(`#${idB} svg rect[data-maidr-bar]`);

    // The marked rects must live only inside their own panel.
    expect(panelA.container.querySelectorAll('rect[data-maidr-bar]')).toHaveLength(ROWS_A.length);
    expect(panelB.container.querySelectorAll('rect[data-maidr-bar]')).toHaveLength(ROWS_B.length);
  });

  it('converts each panel from its own DataTable (data and axes labels)', () => {
    const { doc, root } = makeRoot();
    const panels = [[
      makeBarPanel(doc, root, ROWS_A, 'East', ['Day', 'East Tips']),
      makeBarPanel(doc, root, ROWS_B, 'West', ['Day', 'West Tips']),
    ]];

    const maidr = createMaidrFromGoogleCharts(panels, { root });

    const [east, west] = maidr.subplots[0];
    expect((east.layers[0].data as BarPoint[])).toEqual([{ x: 'Sat', y: 40 }, { x: 'Sun', y: 60 }]);
    expect((west.layers[0].data as BarPoint[])).toHaveLength(3);
    expect(east.layers[0].axes?.y?.label).toBe('East Tips');
    expect(west.layers[0].axes?.y?.label).toBe('West Tips');
  });

  it('assigns figure-unique layer ids and puts panel titles on the first layer', () => {
    const { doc, root } = makeRoot();
    const panels = [
      [makeBarPanel(doc, root, ROWS_A, 'cyl = 4'), makeBarPanel(doc, root, ROWS_A, 'cyl = 6')],
      [makeBarPanel(doc, root, ROWS_A, 'cyl = 8')],
    ];

    const maidr = createMaidrFromGoogleCharts(panels, { root });

    const layers = maidr.subplots.flat().flatMap(subplot => subplot.layers);
    const ids = layers.map(layer => layer.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(layers.map(layer => layer.title)).toEqual(['cyl = 4', 'cyl = 6', 'cyl = 8']);
  });

  it('uses options.id / options.title and defaults id to the root id', () => {
    const { doc, root } = makeRoot();
    const panels = [[makeBarPanel(doc, root, ROWS_A)]];

    const maidr = createMaidrFromGoogleCharts(panels, { root, title: 'Tips by Day' });
    expect(maidr.id).toBe('grid');
    expect(maidr.title).toBe('Tips by Day');

    const explicit = createMaidrFromGoogleCharts(panels, { root, id: 'custom' });
    expect(explicit.id).toBe('custom');
    expect(explicit.title).toBeUndefined();
  });

  it('generates an id for a root without one', () => {
    const { doc, root } = makeRoot();
    const wrapper = doc.createElement('div');
    root.appendChild(wrapper);
    const panels = [[makeBarPanel(doc, wrapper, ROWS_A)]];

    const maidr = createMaidrFromGoogleCharts(panels, { root: wrapper });

    expect(wrapper.id).toBeTruthy();
    expect(maidr.id).toBe(wrapper.id);
  });

  it('throws for an empty panel list or an empty grid row', () => {
    const { root } = makeRoot();
    expect(() => createMaidrFromGoogleCharts([], { root })).toThrow('at least one panel');

    const { doc: doc2, root: root2 } = makeRoot();
    const grid = [[makeBarPanel(doc2, root2, ROWS_A)], []];
    expect(() => createMaidrFromGoogleCharts(grid, { root: root2 })).toThrow('row 1 is empty');
  });

  it('throws when options.root is missing', () => {
    const { doc, root } = makeRoot();
    const panels = [[makeBarPanel(doc, root, ROWS_A)]];
    const options = {} as GoogleChartsGridOptions;
    expect(() => createMaidrFromGoogleCharts(panels, options)).toThrow('options.root is required');
  });

  it('throws when a container is not a descendant of root', () => {
    const { doc, root } = makeRoot();
    const inside = makeBarPanel(doc, root, ROWS_A);
    const outside = makeBarPanel(doc, doc.body as HTMLElement, ROWS_A);

    expect(() => createMaidrFromGoogleCharts([[inside, outside]], { root }))
      .toThrow('panel [0][1] container must be a descendant');
  });

  it('throws when two panels share a container', () => {
    const { doc, root } = makeRoot();
    const panel = makeBarPanel(doc, root, ROWS_A);
    const twin: GoogleChartPanel = { ...panel, title: 'twin' };

    expect(() => createMaidrFromGoogleCharts([[panel, twin]], { root }))
      .toThrow('reuses a container');
  });

  it('throws for non-positive or fractional layout values', () => {
    const { doc, root } = makeRoot();
    const panels = [makeBarPanel(doc, root, ROWS_A)];

    expect(() => createMaidrFromGoogleCharts(panels, { root, layout: { columns: 0 } }))
      .toThrow('positive integer');
    expect(() => createMaidrFromGoogleCharts(panels, { root, layout: { rows: 1.5 } }))
      .toThrow('positive integer');
  });
});

describe('createMaidrFromGoogleChart (single-panel API unchanged)', () => {
  it('still returns a 1x1 grid without subplot selector or layer title', () => {
    const { doc, root } = makeRoot();
    const panel = makeBarPanel(doc, root, ROWS_A);

    const maidr = createMaidrFromGoogleChart(panel.chart, panel.dataTable, panel.container, {
      chartType: 'ColumnChart',
      title: 'Tips by Day',
    });

    expect(maidr.subplots).toHaveLength(1);
    expect(maidr.subplots[0]).toHaveLength(1);
    expect(maidr.title).toBe('Tips by Day');
    expect(maidr.id).toBe(panel.container.id);
    expect(maidr.subplots[0][0].selector).toBeUndefined();
    expect(maidr.subplots[0][0].layers[0].title).toBeUndefined();
    expect(maidr.subplots[0][0].layers[0].selectors)
      .toBe(`#${panel.container.id} svg rect[data-maidr-bar]`);
  });
});

describe('whenGoogleChartsReady', () => {
  /** Fake `google.visualization.events` capturing 'ready' handlers per chart. */
  function makeEvents(): { events: GoogleEvents; fireReady: (chart: GoogleChart) => void } {
    const handlers = new Map<GoogleChart, Set<(...args: unknown[]) => void>>();
    const events: GoogleEvents = {
      addListener: (chart, eventName, handler) => {
        if (eventName === 'ready') {
          const set = handlers.get(chart) ?? new Set();
          set.add(handler);
          handlers.set(chart, set);
        }
        return { remove: () => handlers.get(chart)?.delete(handler) };
      },
      removeAllListeners: (chart) => {
        handlers.delete(chart);
      },
    };
    const fireReady = (chart: GoogleChart): void => {
      const set = handlers.get(chart);
      if (set) {
        [...set].forEach(handler => handler());
      }
    };
    return { events, fireReady };
  }

  function makeChart(): GoogleChart {
    return {
      getSelection: () => [],
      setSelection: () => {},
      getChartLayoutInterface: () => ({
        getBoundingBox: () => null,
        getXLocation: () => 0,
        getYLocation: () => 0,
      }),
    };
  }

  it('invokes the callback only after every chart fired ready', () => {
    const { events, fireReady } = makeEvents();
    const charts = [makeChart(), makeChart(), makeChart()];
    const callback = jest.fn();

    whenGoogleChartsReady(charts, events, callback);

    fireReady(charts[0]);
    fireReady(charts[1]);
    expect(callback).not.toHaveBeenCalled();

    fireReady(charts[2]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('counts each chart once even if it fires ready again (redraw)', () => {
    const { events, fireReady } = makeEvents();
    const charts = [makeChart(), makeChart()];
    const callback = jest.fn();

    whenGoogleChartsReady(charts, events, callback);

    fireReady(charts[0]);
    fireReady(charts[0]); // redraw of the same chart
    expect(callback).not.toHaveBeenCalled();

    fireReady(charts[1]);
    expect(callback).toHaveBeenCalledTimes(1);

    // Listeners were removed; further redraws never re-invoke the callback.
    fireReady(charts[0]);
    fireReady(charts[1]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('invokes the callback immediately for an empty chart list', () => {
    const { events } = makeEvents();
    const callback = jest.fn();

    whenGoogleChartsReady([], events, callback);

    expect(callback).toHaveBeenCalledTimes(1);
  });
});
