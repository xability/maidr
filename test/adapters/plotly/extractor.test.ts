import type { PlotlyCalcData, PlotlyFullLayout, PlotlyGraphDiv, PlotlyHierarchyNode, PlotlyTrace } from '@adapters/plotly/types';
import type { BarPoint, BoxPoint, BoxSelector, ChoroplethPoint, ErrorBarPoint, GanttData, GaugePoint, LinePoint, MaidrLayer, PiePoint, SegmentedPoint, TreemapPoint, ViolinKdePoint } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { normalizePlotlySvg } from '@adapters/plotly/normalizer';
import { describe, expect, it, jest } from '@jest/globals';
import { Figure } from '@model/plot';
import { Orientation, TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface GraphDivOptions {
  id?: string;
  traces: PlotlyTrace[];
  layout: PlotlyFullLayout;
  /** Panel background rect positions rendered into the `.bglayer`. */
  bgRects?: { x: number; y: number }[];
  /** Per-trace calculated data, as plotly leaves it on the graph div. */
  calcdata?: PlotlyCalcData[][];
}

/** Builds a fake rendered Plotly graph div with `_fullData`/`_fullLayout`. */
function createGraphDiv(options: GraphDivOptions): PlotlyGraphDiv {
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document as Document;

  const div = doc.createElement('div');
  div.id = options.id ?? 'chart';
  div.className = 'js-plotly-plot';

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  const bglayer = doc.createElementNS(SVG_NS, 'g');
  bglayer.setAttribute('class', 'bglayer');
  for (const pos of options.bgRects ?? []) {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(pos.x));
    rect.setAttribute('y', String(pos.y));
    bglayer.appendChild(rect);
  }
  svg.appendChild(bglayer);
  div.appendChild(svg);
  doc.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  gd._fullData = options.traces;
  gd._fullLayout = options.layout;
  gd.calcdata = options.calcdata;
  return gd;
}

function scatterTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
  return {
    type: 'scatter',
    mode: 'markers',
    x: [1, 2, 3],
    y: [4, 5, 6],
    ...overrides,
  };
}

/**
 * Standard 2x2 make_subplots-style layout: subplot (1,1) is top-left.
 * Panels: xy (top-left), x2y2 (top-right), x3y3 (bottom-left),
 * x4y4 (bottom-right).
 */
function twoByTwoLayout(extra: Partial<PlotlyFullLayout> = {}): PlotlyFullLayout {
  return {
    xaxis: { domain: [0, 0.45] },
    xaxis2: { domain: [0.55, 1] },
    xaxis3: { domain: [0, 0.45] },
    xaxis4: { domain: [0.55, 1] },
    yaxis: { domain: [0.575, 1] },
    yaxis2: { domain: [0.575, 1] },
    yaxis3: { domain: [0, 0.425] },
    yaxis4: { domain: [0, 0.425] },
    ...extra,
  };
}

const TWO_BY_TWO_RECTS = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 0, y: 300 },
  { x: 400, y: 300 },
];

describe('plotly extractor', () => {
  describe('single-panel behavior (unchanged)', () => {
    it('emits a 1x1 grid without a subplot selector for a plain bar chart', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'Tips' }],
        layout: {
          title: { text: 'My Chart' },
          xaxis: { title: { text: 'Day' }, domain: [0, 1] },
          yaxis: { title: { text: 'Count' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr).not.toBeNull();
      expect(maidr!.id).toBe('chart');
      expect(maidr!.title).toBe('My Chart');
      expect(maidr!.subplots).toHaveLength(1);
      expect(maidr!.subplots[0]).toHaveLength(1);

      const subplot = maidr!.subplots[0][0];
      expect(subplot.selector).toBeUndefined();
      expect(subplot.layers).toHaveLength(1);

      const layer = subplot.layers[0];
      expect(layer.id).toBe('0');
      expect(layer.type).toBe(TraceType.BAR);
      expect(layer.title).toBe('Tips');
      expect(layer.selectors).toBe('.subplot.xy .trace.bars .point > path');
      expect(layer.axes?.x?.label).toBe('Day');
      expect(layer.axes?.y?.label).toBe('Count');
    });
  });

  describe('unsupported traces', () => {
    it('warns once for a trace type MAIDR has no equivalent for', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const gd = createGraphDiv({
        traces: [{ type: 'scatter3d', y: [1, 2, 3] }],
        layout: { xaxis: { domain: [0, 1] }, yaxis: { domain: [0, 1] } },
      });

      try {
        extractPlotlyData(gd);

        const skipped = warn.mock.calls.filter(([message]) =>
          String(message).includes('Unsupported plotly trace type'),
        );
        expect(skipped).toHaveLength(1);
      } finally {
        // A failed assertion must not leave the spy in place for later tests.
        warn.mockRestore();
      }
    });
  });

  describe('pie traces', () => {
    const FRUIT: Partial<PlotlyTrace> = {
      type: 'pie',
      labels: ['Apples', 'Bananas', 'Cherries'],
      values: [30, 50, 20],
      domain: { x: [0, 1], y: [0, 1] },
    };

    /** Calcdata as plotly leaves it once `sort` has put the biggest first. */
    const SORTED_CALCDATA: PlotlyCalcData[][] = [[
      { label: 'Bananas', v: 50 },
      { label: 'Apples', v: 30 },
      { label: 'Cherries', v: 20 },
    ]];

    function onlyPieLayer(gd: PlotlyGraphDiv): MaidrLayer {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('emits a flat pie layer with the slices in the order plotly drew them', () => {
      const gd = createGraphDiv({
        traces: [{ ...FRUIT, name: 'Fruit sales' }],
        layout: {},
        calcdata: SORTED_CALCDATA,
      });

      const layer = onlyPieLayer(gd);

      expect(layer.type).toBe(TraceType.PIE);
      expect(layer.title).toBe('Fruit sales');
      // Drawn order, not authored order: plotly sorts a pie largest-first, and
      // the wedge elements follow suit.
      expect(layer.data as PiePoint[]).toEqual([
        { x: 'Bananas', y: 50 },
        { x: 'Apples', y: 30 },
        { x: 'Cherries', y: 20 },
      ]);
      expect(layer.selectors).toBe(
        '.pielayer > g.trace:nth-of-type(1) g.slice path.surface',
      );
      expect(layer.axes?.x?.label).toBe('Label');
      expect(layer.axes?.y?.label).toBe('Value');
      expect(layer.orientation).toBeUndefined();
    });

    it('withholds the selectors when only the authored order is known', () => {
      const gd = createGraphDiv({ traces: [{ ...FRUIT }], layout: {} });

      const layer = onlyPieLayer(gd);

      // Without calcdata the authored order is all there is, and plotly's
      // default sort means it is not the order of the wedges — highlighting
      // by index would land on the wrong slice.
      expect(layer.data as PiePoint[]).toEqual([
        { x: 'Apples', y: 30 },
        { x: 'Bananas', y: 50 },
        { x: 'Cherries', y: 20 },
      ]);
      expect(layer.selectors).toBeUndefined();
    });

    it('keeps the selectors without calcdata when the trace turned sort off', () => {
      const gd = createGraphDiv({
        traces: [{ ...FRUIT, sort: false }],
        layout: {},
      });

      const layer = onlyPieLayer(gd);

      expect(layer.data as PiePoint[]).toEqual([
        { x: 'Apples', y: 30 },
        { x: 'Bananas', y: 50 },
        { x: 'Cherries', y: 20 },
      ]);
      expect(layer.selectors).toBe(
        '.pielayer > g.trace:nth-of-type(1) g.slice path.surface',
      );
    });

    it('counts only the pies plotly drew when addressing a wedge group', () => {
      const gd = createGraphDiv({
        traces: [
          { ...FRUIT, visible: false },
          { ...FRUIT, sort: false },
        ],
        layout: {},
      });

      // A hidden trace gets no group in `.pielayer`, so the visible pie is
      // still the first one there.
      const layer = onlyPieLayer(gd);

      expect(layer.selectors).toBe(
        '.pielayer > g.trace:nth-of-type(1) g.slice path.surface',
      );
    });

    it('arranges several pies into a grid from their own domains', () => {
      const gd = createGraphDiv({
        traces: [
          { ...FRUIT, sort: false, domain: { x: [0, 0.45], y: [0, 1] } },
          { ...FRUIT, sort: false, domain: { x: [0.55, 1], y: [0, 1] } },
        ],
        layout: {},
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr).not.toBeNull();
      // One panel per pie: a pie has no axis pair to be grouped by, so they
      // must not land in the same subplot.
      expect(maidr!.subplots).toHaveLength(1);
      expect(maidr!.subplots[0]).toHaveLength(2);
      expect(maidr!.subplots[0][0].layers[0].selectors).toBe(
        '.pielayer > g.trace:nth-of-type(1) g.slice path.surface',
      );
      expect(maidr!.subplots[0][1].layers[0].selectors).toBe(
        '.pielayer > g.trace:nth-of-type(2) g.slice path.surface',
      );
      // There is no `axes_…` group around a pie to point a subplot selector at.
      expect(maidr!.subplots[0][0].selector).toBeUndefined();
    });

    it('keeps a pie out of the cartesian panel it shares a figure with', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'Tips' },
          { ...FRUIT, sort: false },
        ],
        layout: {
          xaxis: { title: { text: 'Day' }, domain: [0, 1] },
          yaxis: { title: { text: 'Count' }, domain: [0, 1] },
        },
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr).not.toBeNull();
      const panels = maidr!.subplots.flat();
      expect(panels).toHaveLength(2);
      expect(panels.map(panel => panel.layers[0].type))
        .toEqual([TraceType.BAR, TraceType.PIE]);
      // The bar's axis titles stay with the bar rather than naming the pie's
      // slices and magnitudes.
      expect(panels[0].layers[0].axes?.x?.label).toBe('Day');
      expect(panels[1].layers[0].axes?.x?.label).toBe('Label');
    });
  });

  describe('step traces', () => {
    const SINGLE_PANEL = {
      xaxis: { domain: [0, 1] as [number, number] },
      yaxis: { domain: [0, 1] as [number, number] },
    };

    function stepTrace(shape: string, overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'scatter',
        mode: 'lines',
        x: [1, 2, 3],
        y: [10, 10, 20],
        line: { shape },
        ...overrides,
      };
    }

    function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it.each([
      ['hv', 'hv'],
      ['vh', 'vh'],
      ['hvh', 'mid'],
    ])('binds line.shape %s as a step layer jumping %s', (shape, direction) => {
      const layer = onlyLayer(createGraphDiv({
        traces: [stepTrace(shape)],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.STEP);
      expect(layer.stepDirection).toBe(direction);
      expect(layer.data).toEqual([[
        { x: 1, y: 10, z: 'Series 1' },
        { x: 2, y: 10, z: 'Series 1' },
        { x: 3, y: 20, z: 'Series 1' },
      ]]);
    });

    it('leaves vhv without a direction, since no convention describes it', () => {
      // `vhv` runs flat at the mean of the two levels rather than at either
      // one, so naming any of hv/vh/mid would describe a chart plotly did not
      // draw. It is still a staircase, so it still binds as a step.
      const layer = onlyLayer(createGraphDiv({
        traces: [stepTrace('vhv')],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.STEP);
      expect(layer.stepDirection).toBeUndefined();
    });

    it.each(['linear', 'spline'])('keeps an interpolated %s shape a line', (shape) => {
      const layer = onlyLayer(createGraphDiv({
        traces: [stepTrace(shape)],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.LINE);
      expect(layer.stepDirection).toBeUndefined();
    });

    it('keeps a line with no shape at all a line', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [{ type: 'scatter', mode: 'lines', x: [1, 2], y: [3, 4] }],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.LINE);
    });

    it('ignores line.shape on a markers-only trace, which draws no line', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [stepTrace('hv', { mode: 'markers' })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.SCATTER);
    });

    it('highlights the markers of a lines+markers step, as a line does', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [stepTrace('hv', { mode: 'lines+markers' })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.selectors).toBe('.subplot.xy .trace.scatter .point');
    });

    it('merges step traces sharing a convention into one layer', () => {
      const gd = createGraphDiv({
        traces: [
          stepTrace('hv', { name: 'A' }),
          stepTrace('hv', { name: 'B', y: [5, 15, 15] }),
        ],
        layout: SINGLE_PANEL,
      });

      const layer = onlyLayer(gd);

      expect(layer.type).toBe(TraceType.STEP);
      expect(layer.stepDirection).toBe('hv');
      expect(layer.data).toHaveLength(2);
    });

    it('splits step traces that jump differently, so neither is mislabelled', () => {
      const gd = createGraphDiv({
        traces: [
          stepTrace('hv', { name: 'A' }),
          stepTrace('vh', { name: 'B' }),
          { type: 'scatter', mode: 'lines', x: [1, 2], y: [3, 4], name: 'C' },
        ],
        layout: SINGLE_PANEL,
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers.map(layer => [layer.type, layer.stepDirection])).toEqual([
        [TraceType.LINE, undefined],
        [TraceType.STEP, 'hv'],
        [TraceType.STEP, 'vh'],
      ]);
    });

    it('does not warn about a step trace, which is supported', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const gd = createGraphDiv({
        traces: [stepTrace('hv')],
        layout: SINGLE_PANEL,
      });

      try {
        extractPlotlyData(gd);

        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('2x2 subplot grids', () => {
    it('arranges panels row-major in visual order regardless of trace order', () => {
      // Traces deliberately scrambled: bottom-right first, top-left second, …
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'D', xaxis: 'x4', yaxis: 'y4' }),
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: twoByTwoLayout(),
        bgRects: TWO_BY_TWO_RECTS,
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots).toHaveLength(2);
      expect(maidr!.subplots[0]).toHaveLength(2);
      expect(maidr!.subplots[1]).toHaveLength(2);

      const names = maidr!.subplots.map(row =>
        row.map(subplot => subplot.layers[0].title),
      );
      expect(names).toEqual([['A', 'B'], ['C', 'D']]);
    });

    it('emits per-panel g[id="axes_…"] selectors keyed by chart id and axis pair', () => {
      const gd = createGraphDiv({
        id: 'my-chart',
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ name: 'D', xaxis: 'x4', yaxis: 'y4' }),
        ],
        layout: twoByTwoLayout(),
        bgRects: TWO_BY_TWO_RECTS,
      });

      const maidr = extractPlotlyData(gd);
      const selectors = maidr!.subplots.flat().map(subplot => subplot.selector);

      expect(selectors).toEqual([
        'g[id="axes_my-chart_xy"]',
        'g[id="axes_my-chart_x2y2"]',
        'g[id="axes_my-chart_x3y3"]',
        'g[id="axes_my-chart_x4y4"]',
      ]);
    });

    it('emits selectors even when the bglayer is empty (plotly default styling)', () => {
      // With paper_bgcolor === plot_bgcolor (plotly.js default '#fff'),
      // plotly renders NO per-panel background rects. Selectors must still
      // be emitted so the normalizer can inject panel geometry — otherwise
      // the core cannot detect visual ordering and Up/Down invert.
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ name: 'D', xaxis: 'x4', yaxis: 'y4' }),
        ],
        layout: twoByTwoLayout(),
        bgRects: [],
      });

      const maidr = extractPlotlyData(gd);
      const selectors = maidr!.subplots.flat().map(subplot => subplot.selector);

      expect(selectors).toEqual([
        'g[id="axes_chart_xy"]',
        'g[id="axes_chart_x2y2"]',
        'g[id="axes_chart_x3y3"]',
        'g[id="axes_chart_x4y4"]',
      ]);
    });

    it('gives each layer a figure-unique id (the global trace index)', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ name: 'D', xaxis: 'x4', yaxis: 'y4' }),
        ],
        layout: twoByTwoLayout(),
        bgRects: TWO_BY_TWO_RECTS,
      });

      const maidr = extractPlotlyData(gd);
      const ids = maidr!.subplots.flat().flatMap(s => s.layers.map(l => l.id));

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(['0', '1', '2', '3']);
    });

    it('keeps axis-pair-keyed selectors when a panel is dropped for unsupported traces', () => {
      // Panel x5y5 holds only an unsupported trace type, so it is dropped
      // from the schema — but its background rect is still rendered. The
      // axis-pair key in each selector id keeps the panel↔DOM association
      // correct regardless (the normalizer no longer matches positionally
      // when counts disagree).
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ name: 'D', xaxis: 'x4', yaxis: 'y4' }),
          { type: 'pie', y: [1, 2, 3], xaxis: 'x5', yaxis: 'y5' },
        ],
        layout: twoByTwoLayout({
          xaxis5: { domain: [0, 0.45] },
          yaxis5: { domain: [0, 0.425] },
        }),
        bgRects: [...TWO_BY_TWO_RECTS, { x: 800, y: 300 }],
      });

      const maidr = extractPlotlyData(gd);

      const selectors = maidr!.subplots.flat().map(subplot => subplot.selector);
      expect(selectors).toEqual([
        'g[id="axes_chart_xy"]',
        'g[id="axes_chart_x2y2"]',
        'g[id="axes_chart_x3y3"]',
        'g[id="axes_chart_x4y4"]',
      ]);
    });

    it('supports ragged grids (missing bottom-right panel)', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
        ],
        layout: twoByTwoLayout(),
        bgRects: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 0, y: 300 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots).toHaveLength(2);
      expect(maidr!.subplots[0].map(s => s.layers[0].title)).toEqual(['A', 'B']);
      expect(maidr!.subplots[1].map(s => s.layers[0].title)).toEqual(['C']);
    });

    it('falls back to a single row when layout.grid contradicts the domains', () => {
      // Two vertically stacked panels but grid claims a single row.
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'Top' }),
          scatterTrace({ name: 'Bottom', xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          grid: { rows: 1, columns: 2 },
          xaxis: { domain: [0, 1] },
          xaxis2: { domain: [0, 1] },
          yaxis: { domain: [0.55, 1] },
          yaxis2: { domain: [0, 0.45] },
        },
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots).toHaveLength(1);
      expect(maidr!.subplots[0]).toHaveLength(2);
    });
  });

  describe('overlapping domains (not a grid)', () => {
    it('keeps overlaid dual-axis panels as a single row without selectors', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'Revenue' }),
          scatterTrace({ name: 'Growth', yaxis: 'y2' }),
        ],
        layout: {
          xaxis: { domain: [0, 1] },
          yaxis: { domain: [0, 1] },
          yaxis2: { domain: [0, 1], anchor: 'x' },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots).toHaveLength(1);
      expect(maidr!.subplots[0]).toHaveLength(2);
      const names = maidr!.subplots[0].map(s => s.layers[0].title);
      expect(names).toEqual(['Revenue', 'Growth']);
      expect(maidr!.subplots[0].every(s => s.selector === undefined)).toBe(true);
    });

    it('keeps inset plots as a single row', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'Main' }),
          scatterTrace({ name: 'Inset', xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          xaxis: { domain: [0, 1] },
          yaxis: { domain: [0, 1] },
          xaxis2: { domain: [0.6, 0.9] },
          yaxis2: { domain: [0.6, 0.9] },
        },
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots).toHaveLength(1);
      expect(maidr!.subplots[0]).toHaveLength(2);
    });
  });

  describe('plotly-express style facets', () => {
    function facetGraphDiv(): PlotlyGraphDiv {
      return createGraphDiv({
        traces: [
          scatterTrace({}),
          scatterTrace({ xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          xaxis: { domain: [0, 0.48], title: { text: 'Total Bill' } },
          xaxis2: { domain: [0.52, 1], matches: 'x' },
          yaxis: { domain: [0, 1], title: { text: 'Tip' } },
          yaxis2: { domain: [0, 1], matches: 'y' },
          annotations: [
            { text: 'sex=Female', xref: 'x domain', yref: 'y domain', showarrow: false },
            { text: 'sex=Male', xref: 'x2 domain', yref: 'y2 domain', showarrow: false },
          ],
        },
        bgRects: [{ x: 0, y: 0 }, { x: 400, y: 0 }],
      });
    }

    it('resolves axis labels through matches: chains', () => {
      const maidr = extractPlotlyData(facetGraphDiv());

      const [left, right] = maidr!.subplots[0];
      expect(left.layers[0].axes?.x?.label).toBe('Total Bill');
      expect(right.layers[0].axes?.x?.label).toBe('Total Bill');
      expect(right.layers[0].axes?.y?.label).toBe('Tip');
    });

    it('uses facet annotations as per-panel first-layer titles', () => {
      const maidr = extractPlotlyData(facetGraphDiv());

      expect(maidr!.subplots).toHaveLength(1);
      const titles = maidr!.subplots[0].map(s => s.layers[0].title);
      expect(titles).toEqual(['sex=Female', 'sex=Male']);
    });

    it('uses plotly.py paper-ref annotations as facet column titles (px facet_col)', () => {
      // Real Plotly Express output: _build_subplot_title_annotations
      // hard-codes xref/yref 'paper' on every facet label.
      const gd = createGraphDiv({
        traces: [
          scatterTrace({}),
          scatterTrace({ xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          xaxis: { domain: [0, 0.48] },
          xaxis2: { domain: [0.52, 1], matches: 'x' },
          yaxis: { domain: [0, 1] },
          yaxis2: { domain: [0, 1], matches: 'y' },
          annotations: [
            { text: 'sex=Female', x: 0.24, y: 1, xref: 'paper', yref: 'paper', showarrow: false },
            { text: 'sex=Male', x: 0.76, y: 1, xref: 'paper', yref: 'paper', showarrow: false },
          ],
        },
      });

      const maidr = extractPlotlyData(gd);

      const titles = maidr!.subplots[0].map(s => s.layers[0].title);
      expect(titles).toEqual(['sex=Female', 'sex=Male']);
    });

    it('combines paper-ref column and row titles for a facet_row + facet_col grid', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({}),
          scatterTrace({ xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ xaxis: 'x4', yaxis: 'y4' }),
        ],
        layout: twoByTwoLayout({
          annotations: [
            // Column titles sit above the top row…
            { text: 'sex=Female', x: 0.225, y: 1, xref: 'paper', yref: 'paper', showarrow: false },
            { text: 'sex=Male', x: 0.775, y: 1, xref: 'paper', yref: 'paper', showarrow: false },
            // …row titles sit right of each row, rotated 90°.
            { text: 'smoker=Yes', x: 1, y: 0.7875, xref: 'paper', yref: 'paper', showarrow: false, textangle: 90 },
            { text: 'smoker=No', x: 1, y: 0.2125, xref: 'paper', yref: 'paper', showarrow: false, textangle: 90 },
          ],
        }),
      });

      const maidr = extractPlotlyData(gd);

      const titles = maidr!.subplots.map(row => row.map(s => s.layers[0].title));
      expect(titles).toEqual([
        ['sex=Female, smoker=Yes', 'sex=Male, smoker=Yes'],
        ['sex=Female, smoker=No', 'sex=Male, smoker=No'],
      ]);
    });

    it('keeps per-panel paper-ref titles per panel (px facet_col_wrap / subplot_titles)', () => {
      // Every panel has its own title annotation just above its top edge,
      // so top-row titles must NOT be promoted to whole-column titles.
      const gd = createGraphDiv({
        traces: [
          scatterTrace({}),
          scatterTrace({ xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ xaxis: 'x4', yaxis: 'y4' }),
        ],
        layout: twoByTwoLayout({
          annotations: [
            { text: 'day=Thur', x: 0.225, y: 1, xref: 'paper', yref: 'paper', showarrow: false },
            { text: 'day=Fri', x: 0.775, y: 1, xref: 'paper', yref: 'paper', showarrow: false },
            { text: 'day=Sat', x: 0.225, y: 0.425, xref: 'paper', yref: 'paper', showarrow: false },
            { text: 'day=Sun', x: 0.775, y: 0.425, xref: 'paper', yref: 'paper', showarrow: false },
          ],
        }),
      });

      const maidr = extractPlotlyData(gd);

      const titles = maidr!.subplots.map(row => row.map(s => s.layers[0].title));
      expect(titles).toEqual([
        ['day=Thur', 'day=Fri'],
        ['day=Sat', 'day=Sun'],
      ]);
    });

    it('skips make_subplots global x_title/y_title annotations', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          xaxis: { domain: [0, 0.48] },
          xaxis2: { domain: [0.52, 1] },
          yaxis: { domain: [0, 1] },
          yaxis2: { domain: [0, 1] },
          annotations: [
            // Global axis titles: below the plot area / left of it (rotated).
            { text: 'Total Bill', x: 0.5, y: -0.06, xref: 'paper', yref: 'paper', showarrow: false },
            { text: 'Tip', x: -0.05, y: 0.5, xref: 'paper', yref: 'paper', showarrow: false, textangle: -90 },
          ],
        },
      });

      const maidr = extractPlotlyData(gd);

      const titles = maidr!.subplots[0].map(s => s.layers[0].title);
      expect(titles).toEqual(['A', 'B']);
    });

    it('ignores annotations that are not cleanly attributable to a panel', () => {
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          xaxis: { domain: [0, 0.48] },
          xaxis2: { domain: [0.52, 1] },
          yaxis: { domain: [0, 1] },
          yaxis2: { domain: [0, 1] },
          annotations: [
            { text: 'Figure note', xref: 'paper', yref: 'paper', showarrow: false },
          ],
        },
      });

      const maidr = extractPlotlyData(gd);
      const titles = maidr!.subplots[0].map(s => s.layers[0].title);
      expect(titles).toEqual(['A', 'B']);
    });
  });

  describe('plotly editor placeholder titles', () => {
    /**
     * What plotly.js 3.1.1 puts in `_fullLayout` for a chart drawn with no
     * layout at all. The placeholders are never rendered outside editable
     * mode, so announcing them would describe axes no sighted reader sees.
     */
    const EN_DFLT_TITLE = {
      plot: 'Click to enter Plot title',
      subtitle: 'Click to enter Plot subtitle',
      x: 'Click to enter X axis title',
      y: 'Click to enter Y axis title',
      colorbar: 'Click to enter Colorscale title',
      annotation: 'new text',
    };

    it('omits axis labels and the figure title that plotly only filled in as placeholders', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1', 'Q2'], y: [120, 90] }],
        layout: {
          _dfltTitle: EN_DFLT_TITLE,
          title: { text: 'Click to enter Plot title' },
          xaxis: { title: { text: 'Click to enter X axis title' }, domain: [0, 1] },
          yaxis: { title: { text: 'Click to enter Y axis title' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.title).toBeUndefined();
      const axes = maidr!.subplots[0][0].layers[0].axes;
      expect(axes?.x).toBeUndefined();
      expect(axes?.y).toBeUndefined();
    });

    it('omits placeholders translated by a non-English plotly locale', () => {
      // `_dfltTitle` is filled from plotly's localisation dictionary, so a
      // fix that matched the English wording alone would pass the chart above
      // and still fabricate axis names here.
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1'], y: [120] }],
        layout: {
          _dfltTitle: {
            plot: 'Cliquez pour saisir le titre du graphique',
            x: 'Cliquez pour saisir le titre de l\'axe X',
            y: 'Cliquez pour saisir le titre de l\'axe Y',
          },
          title: { text: 'Cliquez pour saisir le titre du graphique' },
          xaxis: { title: { text: 'Cliquez pour saisir le titre de l\'axe X' }, domain: [0, 1] },
          yaxis: { title: { text: 'Cliquez pour saisir le titre de l\'axe Y' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.title).toBeUndefined();
      const axes = maidr!.subplots[0][0].layers[0].axes;
      expect(axes?.x).toBeUndefined();
      expect(axes?.y).toBeUndefined();
    });

    it('keeps the titles the author did supply', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1'], y: [120] }],
        layout: {
          _dfltTitle: EN_DFLT_TITLE,
          title: { text: 'Quarterly revenue' },
          xaxis: { title: { text: 'Quarter' }, domain: [0, 1] },
          yaxis: { title: { text: 'Click to enter Y axis title' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.title).toBe('Quarterly revenue');
      const axes = maidr!.subplots[0][0].layers[0].axes;
      expect(axes?.x?.label).toBe('Quarter');
      expect(axes?.y).toBeUndefined();
    });

    it('keeps a title matching the annotation placeholder, which stands in for no title', () => {
      // `_dfltTitle.annotation` is 'new text' — not a title slot, and short
      // enough to be a label an author really wrote.
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1'], y: [120] }],
        layout: {
          _dfltTitle: EN_DFLT_TITLE,
          title: { text: 'new text' },
          xaxis: { title: { text: 'new text' }, domain: [0, 1] },
          yaxis: { title: { text: 'Click to enter Y axis title' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.title).toBe('new text');
      const axes = maidr!.subplots[0][0].layers[0].axes;
      expect(axes?.x?.label).toBe('new text');
      expect(axes?.y).toBeUndefined();
    });

    it('follows a matches: chain past an inner axis holding only a placeholder', () => {
      // Plotly Express keeps a facet's shared title on the outer axis and
      // resolves every inner axis to the placeholder, so the inner title has
      // to be discarded before the chain can be followed.
      const gd = createGraphDiv({
        traces: [
          scatterTrace({}),
          scatterTrace({ xaxis: 'x2', yaxis: 'y2' }),
        ],
        layout: {
          _dfltTitle: EN_DFLT_TITLE,
          xaxis: { domain: [0, 0.48], title: { text: 'Total Bill' } },
          xaxis2: { domain: [0.52, 1], matches: 'x', title: { text: 'Click to enter X axis title' } },
          yaxis: { domain: [0, 1], title: { text: 'Tip' } },
          yaxis2: { domain: [0, 1], matches: 'y', title: { text: 'Click to enter Y axis title' } },
        },
        bgRects: [{ x: 0, y: 0 }, { x: 400, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      const [left, right] = maidr!.subplots[0];
      expect(left.layers[0].axes?.x?.label).toBe('Total Bill');
      expect(right.layers[0].axes?.x?.label).toBe('Total Bill');
      expect(right.layers[0].axes?.y?.label).toBe('Tip');
    });

    it('falls back to the heatmap default fill label for a placeholder colorbar title', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'heatmap',
          z: [[1, 2], [3, 4]],
          colorbar: { title: { text: 'Click to enter Colorscale title' } },
        }],
        layout: {
          _dfltTitle: EN_DFLT_TITLE,
          xaxis: { domain: [0, 1] },
          yaxis: { domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0][0].layers[0].axes?.z?.label).toBe('Value');
    });

    it('keeps a colorbar title the author did supply', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'heatmap',
          z: [[1, 2], [3, 4]],
          colorbar: { title: { text: 'Density' } },
        }],
        layout: {
          _dfltTitle: EN_DFLT_TITLE,
          xaxis: { domain: [0, 1] },
          yaxis: { domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0][0].layers[0].axes?.z?.label).toBe('Density');
    });

    it('still recognises the English placeholders when the layout carries no _dfltTitle', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1'], y: [120] }],
        layout: {
          title: { text: 'Click to enter Plot title' },
          xaxis: { title: { text: 'Click to enter X axis title' }, domain: [0, 1] },
          yaxis: { title: { text: 'Click to enter Y axis title' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.title).toBeUndefined();
      const axes = maidr!.subplots[0][0].layers[0].axes;
      expect(axes?.x).toBeUndefined();
      expect(axes?.y).toBeUndefined();
    });

    it('still recognises an English colorbar placeholder when the layout carries no _dfltTitle', () => {
      // The third caller of the shared check, so the fallback is covered at
      // every site rather than through the axis labels alone.
      const gd = createGraphDiv({
        traces: [{
          type: 'heatmap',
          z: [[1, 2], [3, 4]],
          colorbar: { title: { text: 'Click to enter Colorscale title' } },
        }],
        layout: {
          xaxis: { domain: [0, 1] },
          yaxis: { domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0][0].layers[0].axes?.z?.label).toBe('Value');
    });
  });

  describe('violin traces', () => {
    /**
     * One violin's calc data, shaped like plotly's: the box statistics from
     * the shared box calc, the KDE samples (`t` is the value-axis coordinate,
     * `v` the density there) and the pixel centre plotly records while drawing.
     */
    function violinCalc(overrides: Partial<PlotlyCalcData> = {}): PlotlyCalcData {
      return {
        pos: 0,
        min: 1,
        q1: 2,
        med: 3,
        q3: 4,
        max: 9,
        mean: 3.6,
        posCenterPx: 110,
        density: [
          { v: 0.1, t: 1 },
          { v: 0.3, t: 3 },
          { v: 0.05, t: 9 },
        ],
        ...overrides,
      };
    }

    /** Categorical position axis on x, value axis on y (plotly's default). */
    function violinLayout(extra: Partial<PlotlyFullLayout> = {}): PlotlyFullLayout {
      return {
        xaxis: {
          domain: [0, 1],
          title: { text: 'Group' },
          _categories: ['A', 'B'],
          c2p: value => 110 + 220 * value,
        },
        yaxis: {
          domain: [0, 1],
          title: { text: 'Value' },
          c2p: value => 300 - 20 * value,
        },
        ...extra,
      };
    }

    it('emits the box layer and the KDE layer, box first', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'violin', y: [1, 2, 3], name: 'A', box: { visible: true } }],
        layout: violinLayout(),
        calcdata: [[violinCalc()]],
      });

      const maidr = extractPlotlyData(gd);

      const layers = maidr!.subplots[0][0].layers;
      expect(layers.map(layer => layer.type)).toEqual([
        TraceType.VIOLIN_BOX,
        TraceType.VIOLIN_KDE,
      ]);
      expect(new Set(layers.map(layer => layer.id)).size).toBe(2);
      for (const layer of layers) {
        expect(layer.orientation).toBe('vert');
        expect(layer.axes?.x?.label).toBe('Group');
        expect(layer.axes?.y?.label).toBe('Value');
      }
    });

    it('reads the quartile summary and the KDE curve from plotly calc data', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'violin', y: [1, 2, 3], name: 'A', box: { visible: true } }],
        layout: violinLayout(),
        calcdata: [[violinCalc()]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;

      expect(boxLayer.data as BoxPoint[]).toEqual([{
        z: 'A',
        lowerOutliers: [],
        min: 1,
        q1: 2,
        q2: 3,
        q3: 4,
        max: 9,
        upperOutliers: [],
        mean: 3.6,
      }]);

      // Highlight circles are placed on the violin's centre line, at the
      // value-axis pixel of each density sample.
      expect(kdeLayer.data as ViolinKdePoint[][]).toEqual([[
        { x: 'A', y: 1, density: 0.1, svg_x: 110, svg_y: 280 },
        { x: 'A', y: 3, density: 0.3, svg_x: 110, svg_y: 240 },
        { x: 'A', y: 9, density: 0.05, svg_x: 110, svg_y: 120 },
      ]]);
    });

    it('points each layer at the elements plotly draws for that violin', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'violin', y: [1, 2, 3], name: 'A', box: { visible: true } }],
        layout: violinLayout(),
        calcdata: [[violinCalc()]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;
      const group = '.subplot.xy .violinlayer > g:nth-child(1)';

      expect(kdeLayer.selectors).toEqual([`${group} > path.violin:nth-child(1)`]);
      // The inner boxes follow every violin outline in the trace's group.
      expect(boxLayer.selectors as BoxSelector[]).toEqual([{
        lowerOutliers: [],
        min: `${group} > path.box:nth-child(2)`,
        iq: `${group} > path.box:nth-child(2)`,
        q2: `${group} > path.box:nth-child(2)`,
        max: `${group} > path.box:nth-child(2)`,
        upperOutliers: [],
      }]);
    });

    it('names each violin of a categorical trace after its category', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'violin',
          x: ['a', 'a', 'b', 'b'],
          y: [1, 2, 3, 4],
          name: 'g1',
          box: { visible: true },
        }],
        layout: violinLayout({
          xaxis: { domain: [0, 1], _categories: ['a', 'b'], c2p: value => 110 + 220 * value },
        }),
        calcdata: [[
          violinCalc({ pos: 0, posCenterPx: 110 }),
          violinCalc({ pos: 1, posCenterPx: 330 }),
        ]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;
      const group = '.subplot.xy .violinlayer > g:nth-child(1)';

      expect((boxLayer.data as BoxPoint[]).map(point => point.z)).toEqual(['g1, a', 'g1, b']);
      expect(kdeLayer.selectors).toEqual([
        `${group} > path.violin:nth-child(1)`,
        `${group} > path.violin:nth-child(2)`,
      ]);
      expect((boxLayer.selectors as BoxSelector[]).map(selector => selector.iq)).toEqual([
        `${group} > path.box:nth-child(3)`,
        `${group} > path.box:nth-child(4)`,
      ]);
    });

    it('gathers the violins of several traces into one pair of layers', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'violin', y: [1, 2, 3], name: 'A', box: { visible: true } },
          { type: 'violin', y: [2, 3, 4], name: 'B', box: { visible: true } },
        ],
        layout: violinLayout(),
        calcdata: [
          [violinCalc({ pos: 0, posCenterPx: 110 })],
          [violinCalc({ pos: 1, posCenterPx: 330 })],
        ],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;

      expect((boxLayer.data as BoxPoint[]).map(point => point.z)).toEqual(['A', 'B']);
      expect(kdeLayer.selectors).toEqual([
        '.subplot.xy .violinlayer > g:nth-child(1) > path.violin:nth-child(1)',
        '.subplot.xy .violinlayer > g:nth-child(2) > path.violin:nth-child(1)',
      ]);
    });

    it('keeps the highlight of the violins that do have an inner box', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'violin', y: [1, 2, 3], name: 'A', box: { visible: true } },
          { type: 'violin', y: [2, 3, 4], name: 'B' },
        ],
        layout: violinLayout(),
        calcdata: [
          [violinCalc({ pos: 0, posCenterPx: 110 })],
          [violinCalc({ pos: 1, posCenterPx: 330 })],
        ],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer] = maidr!.subplots[0][0].layers;

      // One trace drawing no box does not cost the other one its highlight;
      // the second selector points at a position that holds no `path.box`.
      expect((boxLayer.selectors as BoxSelector[]).map(selector => selector.iq)).toEqual([
        '.subplot.xy .violinlayer > g:nth-child(1) > path.box:nth-child(2)',
        '.subplot.xy .violinlayer > g:nth-child(2) > path.box:nth-child(2)',
      ]);
    });

    it('places a violin from its position when plotly recorded no pixel centre', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'violin', y: [1, 2, 3], name: 'A' }],
        layout: violinLayout(),
        calcdata: [[{
          ...violinCalc({ pos: 1 }),
          posCenterPx: undefined,
          // Grouped violins sit either side of the category centre.
          t: { bPos: 0.5 },
        }]],
      });

      const maidr = extractPlotlyData(gd);
      const [, kdeLayer] = maidr!.subplots[0][0].layers;

      // c2p(pos + bPos) = 110 + 220 * 1.5
      expect((kdeLayer.data as ViolinKdePoint[][])[0][0].svg_x).toBe(440);
    });

    it('keeps the statistics but drops the selectors when no inner box is drawn', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'violin', y: [1, 2, 3], name: 'A' }],
        layout: violinLayout(),
        calcdata: [[violinCalc()]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;

      expect(boxLayer.data).toHaveLength(1);
      expect(boxLayer.selectors).toBeUndefined();
      expect(kdeLayer.selectors).toHaveLength(1);
    });

    it('makes the mean navigable where plotly draws a mean line', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'violin',
          y: [1, 2, 3],
          name: 'A',
          box: { visible: true },
          meanline: { visible: true },
        }],
        layout: violinLayout(),
        calcdata: [[violinCalc()]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer] = maidr!.subplots[0][0].layers;

      expect(boxLayer.violinOptions).toEqual({ showMean: true });
      expect((boxLayer.selectors as BoxSelector[])[0].mean)
        .toBe('.subplot.xy .violinlayer > g:nth-child(1) > path.mean:nth-child(3)');
    });

    it('emits a horizontal violin bottom-first, with the axes swapped', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'violin',
          x: [1, 2, 3],
          orientation: 'h',
          name: 'A',
          box: { visible: true },
        }],
        layout: {
          xaxis: { domain: [0, 1], title: { text: 'Value' }, c2p: value => 20 + 10 * value },
          yaxis: { domain: [0, 1], title: { text: 'Group' }, _categories: ['A', 'B'], c2p: value => 300 - 100 * value },
        },
        calcdata: [[
          violinCalc({ pos: 0, posCenterPx: 300 }),
          violinCalc({ pos: 1, posCenterPx: 200 }),
        ]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;

      expect(boxLayer.orientation).toBe('horz');
      // The core reverses horizontal rows into visual order, so the topmost
      // violin is emitted first and comes back as plotly's last one.
      expect((boxLayer.data as BoxPoint[]).map(point => point.z)).toEqual(['A, B', 'A, A']);
      expect((kdeLayer.data as ViolinKdePoint[][])[1][0]).toEqual({
        x: 'A, A',
        y: 1,
        density: 0.1,
        svg_x: 30,
        svg_y: 300,
      });
    });

    it('leaves out a position plotly computed no density for', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'violin',
          x: ['a', 'b', 'c'],
          y: [1, 2, 3],
          name: 'g1',
          box: { visible: true },
        }],
        layout: violinLayout({
          xaxis: { domain: [0, 1], _categories: ['a', 'b', 'c'], c2p: value => 110 + 220 * value },
        }),
        calcdata: [[
          violinCalc({ pos: 0, posCenterPx: 110 }),
          { pos: 1, posCenterPx: 330 },
          violinCalc({ pos: 2, posCenterPx: 550 }),
        ]],
      });

      const maidr = extractPlotlyData(gd);
      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;
      const group = '.subplot.xy .violinlayer > g:nth-child(1)';

      // No violin of zeroes for the position without a curve, and the third
      // violin still points at the third element plotly rendered.
      expect((boxLayer.data as BoxPoint[]).map(point => point.z)).toEqual(['g1, a', 'g1, c']);
      expect(kdeLayer.selectors).toEqual([
        `${group} > path.violin:nth-child(1)`,
        `${group} > path.violin:nth-child(3)`,
      ]);
    });

    it('skips a violin chart whose calc data plotly has not computed', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'violin', y: [1, 2, 3], name: 'A' }],
        layout: violinLayout(),
      });

      expect(extractPlotlyData(gd)).toBeNull();
    });
  });

  describe('core-model integration', () => {
    /**
     * The model and normalizer resolve elements via page globals; point
     * them at the graph div's JSDOM window for the duration of `fn`.
     */
    function withDomGlobals(gd: PlotlyGraphDiv, fn: (doc: Document) => void): void {
      const doc = gd.ownerDocument;
      const win = doc.defaultView!;
      // jsdom implements only part of the SVG DOM, so stand in for the element
      // classes it lacks: the model's `instanceof` checks then resolve and
      // match nothing, leaving highlight elements a browser-only concern.
      const svgClass = (name: string): unknown =>
        (win as unknown as Record<string, unknown>)[name] ?? class {};
      const overrides: Record<string, unknown> = {
        document: doc,
        window: win,
        MutationObserver: win.MutationObserver,
        requestAnimationFrame: () => 0,
        SVGUseElement: svgClass('SVGUseElement'),
        SVGPathElement: svgClass('SVGPathElement'),
        SVGPolygonElement: svgClass('SVGPolygonElement'),
      };
      const testGlobals = globalThis as Record<string, unknown>;
      const saved = new Map<string, unknown>();
      for (const [key, value] of Object.entries(overrides)) {
        saved.set(key, testGlobals[key]);
        testGlobals[key] = value;
      }
      try {
        fn(doc);
      } finally {
        for (const [key, value] of saved) {
          if (value === undefined) {
            delete testGlobals[key];
          } else {
            testGlobals[key] = value;
          }
        }
      }
    }

    function twoByTwoBarTraces(): PlotlyTrace[] {
      return [
        { type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'A' },
        { type: 'bar', x: ['a', 'b'], y: [3, 4], name: 'B', xaxis: 'x2', yaxis: 'y2' },
        { type: 'bar', x: ['a', 'b'], y: [5, 6], name: 'C', xaxis: 'x3', yaxis: 'y3' },
        { type: 'bar', x: ['a', 'b'], y: [7, 8], name: 'D', xaxis: 'x4', yaxis: 'y4' },
      ];
    }

    it('the emitted multi-panel Maidr constructs a navigable Figure', () => {
      const gd = createGraphDiv({
        traces: twoByTwoBarTraces(),
        layout: twoByTwoLayout(),
        bgRects: TWO_BY_TWO_RECTS,
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, (doc) => {
        const svg = gd.querySelector('svg.main-svg') as SVGSVGElement;
        normalizePlotlySvg(svg, maidr!);

        // The normalizer wrapped each bglayer rect in the panel's axes group.
        expect(doc.querySelectorAll('g[id^="axes_"]')).toHaveLength(4);

        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        expect(figure.state).toMatchObject({ size: 4 });
        const summaries = figure.getSubplotSummaries();
        expect(summaries).toHaveLength(4);
        expect(summaries.map(summary => summary.title)).toEqual(['A', 'B', 'C', 'D']);
        expect(summaries.map(summary => summary.traceTypes)).toEqual([
          ['bar'],
          ['bar'],
          ['bar'],
          ['bar'],
        ]);

        // Reading the state exercises Subplot/Trace construction end-to-end
        // (this is exactly what crashes on empty subplots or bad selectors).
        const state = figure.state;
        expect(state.empty).toBe(false);
        if (!state.empty) {
          expect(state.size).toBe(4);
        }
      });
    });

    it('a plotly step chart reaches the core as a step trace', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'scatter',
          mode: 'lines',
          x: [1, 2, 3, 4],
          y: [10, 10, 20, 20],
          line: { shape: 'hv' },
          name: 'Level',
        }],
        layout: {
          xaxis: { domain: [0, 1] },
          yaxis: { domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        // 'step', not 'line': the trace a reader actually navigates, with the
        // transition rotor and the step convention that come with it.
        expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.STEP]);
      });
    });

    it('injected panel geometry fixes vertical ordering when no bg rects exist', () => {
      // plotly's DEFAULT styling (paper_bgcolor === plot_bgcolor) renders an
      // EMPTY .bglayer. The normalizer must inject per-panel rects from the
      // computed axis offsets so the core detects that data row 0 is
      // visually on TOP and inverts vertical arrow keys accordingly.
      const layout = twoByTwoLayout();
      const pixelOffsets: Record<string, { _offset: number; _length: number }> = {
        xaxis: { _offset: 80, _length: 300 },
        xaxis2: { _offset: 480, _length: 300 },
        xaxis3: { _offset: 80, _length: 300 },
        xaxis4: { _offset: 480, _length: 300 },
        yaxis: { _offset: 60, _length: 200 },
        yaxis2: { _offset: 60, _length: 200 },
        yaxis3: { _offset: 320, _length: 200 },
        yaxis4: { _offset: 320, _length: 200 },
      };
      for (const [axisName, offsets] of Object.entries(pixelOffsets)) {
        Object.assign(layout[axisName] as object, offsets);
      }

      const gd = createGraphDiv({
        traces: twoByTwoBarTraces(),
        layout,
        bgRects: [],
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, (doc) => {
        const svg = gd.querySelector('svg.main-svg') as SVGSVGElement;
        normalizePlotlySvg(svg, maidr!);

        // Injected transparent rects, wrapped in axis-pair-keyed groups.
        const groups = Array.from(doc.querySelectorAll('g[id^="axes_"]'));
        expect(groups.map(group => group.id)).toEqual([
          'axes_chart_xy',
          'axes_chart_x2y2',
          'axes_chart_x3y3',
          'axes_chart_x4y4',
        ]);
        const bottomLeft = doc.querySelector('g[id="axes_chart_x3y3"] > rect')!;
        expect(bottomLeft.getAttribute('x')).toBe('80');
        expect(bottomLeft.getAttribute('y')).toBe('320');
        expect(bottomLeft.getAttribute('width')).toBe('300');
        expect(bottomLeft.getAttribute('height')).toBe('200');
        expect(bottomLeft.getAttribute('fill')).toBe('none');

        const figure = new Figure(maidr!);

        // jsdom reports zero geometry; stand in for the browser by deriving
        // each axes group's bounding box from its rect attributes (covers
        // the hidden clones the model created from the subplot selectors).
        for (const group of Array.from(doc.querySelectorAll('g[id^="axes_"]'))) {
          const rect = group.querySelector('rect')!;
          const x = Number(rect.getAttribute('x'));
          const y = Number(rect.getAttribute('y'));
          const width = Number(rect.getAttribute('width'));
          const height = Number(rect.getAttribute('height'));
          Object.defineProperty(group, 'getBoundingClientRect', {
            value: () => ({
              top: y,
              left: x,
              width,
              height,
              right: x + width,
              bottom: y + height,
              x,
              y,
            }),
            configurable: true,
          });
        }

        const subplotLayout = resolveSubplotLayout(figure.subplots);
        expect(subplotLayout.invertVertical).toBe(true);
        expect(subplotLayout.topLeftRow).toBe(0);
        expect(subplotLayout.visualOrderMap.get('0,0')).toBe(1);
        expect(subplotLayout.visualOrderMap.get('0,1')).toBe(2);
        expect(subplotLayout.visualOrderMap.get('1,0')).toBe(3);
        expect(subplotLayout.visualOrderMap.get('1,1')).toBe(4);
      });
    });

    it('the emitted violin Maidr constructs a two-layer Figure with resolvable selectors', () => {
      const violinCalcData = (pos: number, posCenterPx: number): PlotlyCalcData => ({
        pos,
        posCenterPx,
        min: 1,
        q1: 2,
        med: 3,
        q3: 4,
        max: 9,
        mean: 3.6,
        density: [{ v: 0.1, t: 1 }, { v: 0.3, t: 3 }],
      });

      const gd = createGraphDiv({
        traces: [
          { type: 'violin', y: [1, 2, 3], name: 'A', box: { visible: true } },
          { type: 'violin', y: [2, 3, 4], name: 'B', box: { visible: true } },
        ],
        layout: {
          xaxis: { domain: [0, 1], _categories: ['A', 'B'], c2p: value => 110 + 220 * value },
          yaxis: { domain: [0, 1], c2p: value => 300 - 20 * value },
        },
        bgRects: [{ x: 0, y: 0 }],
      });
      gd.calcdata = [[violinCalcData(0, 110)], [violinCalcData(1, 330)]];

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      // Rebuild the layer plotly renders for these two traces: every violin
      // outline of a trace, then its inner boxes, inside one group per trace.
      const doc = gd.ownerDocument;
      const svg = gd.querySelector('svg.main-svg')!;
      const subplot = doc.createElementNS(SVG_NS, 'g');
      subplot.setAttribute('class', 'subplot xy');
      const violinLayer = doc.createElementNS(SVG_NS, 'g');
      violinLayer.setAttribute('class', 'violinlayer mlayer');
      for (let trace = 0; trace < 2; trace++) {
        const traceGroup = doc.createElementNS(SVG_NS, 'g');
        traceGroup.setAttribute('class', 'trace violins');
        for (const className of ['violin', 'box']) {
          const path = doc.createElementNS(SVG_NS, 'path');
          path.setAttribute('class', className);
          // jsdom has no layout engine; the model reads getBBox() off the
          // inner box to place the Q1/Q3 highlight lines.
          Object.defineProperty(path, 'getBBox', {
            value: () => ({ x: 100, y: 200, width: 20, height: 60 }),
            configurable: true,
          });
          traceGroup.appendChild(path);
        }
        violinLayer.appendChild(traceGroup);
      }
      subplot.appendChild(violinLayer);
      svg.appendChild(subplot);

      const [boxLayer, kdeLayer] = maidr!.subplots[0][0].layers;
      const selectors = [
        ...(kdeLayer.selectors as string[]),
        ...(boxLayer.selectors as BoxSelector[]).map(selector => selector.iq),
      ];
      for (const selector of selectors) {
        expect(doc.querySelectorAll(selector)).toHaveLength(1);
      }

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        // Both violin traces are constructed, and the box layer is the one
        // the user lands on.
        expect(figure.subplots[0][0].traceTypes).toEqual(['violin_box', 'violin_kde']);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });

    it('constructs a navigable trace for each of the bar-like and banded types', () => {
      const gd = createGraphDiv({
        traces: [
          {
            type: 'waterfall',
            x: ['Opening', 'Sales', 'Closing'],
            y: [1000, 400, 0],
            measure: ['absolute', 'relative', 'total'],
            name: 'Revenue',
          },
          {
            type: 'funnel',
            orientation: 'h',
            y: ['Visited', 'Purchased'],
            x: [10000, 100],
            name: 'Conversion',
            xaxis: 'x2',
            yaxis: 'y2',
          },
          {
            type: 'scatter',
            mode: 'markers',
            x: [1, 2],
            y: [4.2, 5.1],
            error_y: { visible: true, type: 'data', array: [0.4, 0.3] },
            name: 'Treatment',
            xaxis: 'x3',
            yaxis: 'y3',
          },
          {
            type: 'scatter',
            mode: 'lines',
            x: ['Q1', 'Q2'],
            y: [120, 80],
            fill: 'tozeroy',
            stackgroup: 'one',
            name: 'East',
            xaxis: 'x4',
            yaxis: 'y4',
          },
          {
            type: 'scatter',
            mode: 'lines',
            x: ['Q1', 'Q2'],
            y: [90, 70],
            fill: 'tonexty',
            stackgroup: 'one',
            name: 'West',
            xaxis: 'x4',
            yaxis: 'y4',
          },
        ],
        layout: twoByTwoLayout(),
        bgRects: TWO_BY_TWO_RECTS,
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        // Every payload is one the core's factory recognises and can build a
        // trace from — the emitted shapes, not just the emitted type names.
        expect(figure.getSubplotSummaries().map(summary => summary.traceTypes)).toEqual([
          ['waterfall'],
          ['funnel'],
          ['error_bar'],
          ['stacked_area'],
        ]);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });

    it('constructs a navigable trace for each of the domain-positioned types', () => {
      const gd = createGraphDiv({
        traces: [
          {
            type: 'sunburst',
            labels: ['World', 'Asia', 'Europe'],
            parents: ['', 'World', 'World'],
            values: [100, 60, 40],
            domain: { x: [0, 0.45], y: [0.575, 1] },
            name: 'Population',
          },
          {
            type: 'sankey',
            node: { label: ['Coal', 'Electricity', 'Losses'] },
            link: { source: [0, 0, 1], target: [1, 2, 2], value: [34, 8, 12] },
            domain: { x: [0.55, 1], y: [0.575, 1] },
            name: 'Energy',
          },
          {
            type: 'indicator',
            mode: 'gauge+number',
            value: 73,
            title: { text: 'Conversion' },
            gauge: { shape: 'angular', axis: { range: [0, 100] } },
            domain: { x: [0, 0.45], y: [0, 0.425] },
          },
          {
            type: 'parcoords',
            dimensions: [
              { label: 'mpg', values: [33, 21] },
              { label: 'hp', values: [65, 110] },
            ],
            domain: { x: [0.55, 1], y: [0, 0.425] },
          },
        ],
        layout: {},
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        // Every payload is one the core's factory recognises and can build a
        // trace from — the emitted shapes, not just the emitted type names.
        expect(figure.getSubplotSummaries().map(summary => summary.traceTypes)).toEqual([
          ['sunburst'],
          ['sankey'],
          ['gauge'],
          ['parallel_coordinates'],
        ]);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });

    it('constructs a navigable trace for each of the derived cartesian types', () => {
      const day = 86400000;
      const march = Date.UTC(2024, 2, 1);
      const gd = createGraphDiv({
        traces: [
          {
            type: 'bar',
            orientation: 'h',
            base: [march],
            x: [4 * day],
            y: ['Design'],
            name: 'Team A',
          },
          {
            type: 'bar',
            orientation: 'h',
            y: ['0-9'],
            x: [-5],
            name: 'Male',
            xaxis: 'x2',
            yaxis: 'y2',
          },
          {
            type: 'bar',
            orientation: 'h',
            y: ['0-9'],
            x: [5],
            name: 'Female',
            xaxis: 'x2',
            yaxis: 'y2',
          },
          {
            type: 'scatter',
            mode: 'markers',
            uid: 'dot1',
            x: ['Chicago', 'Boston'],
            y: [21, 17],
            xaxis: 'x3',
            yaxis: 'y3',
          },
          {
            type: 'scatter',
            mode: 'text',
            uid: 'wc1',
            x: [1, 2],
            y: [2, 1],
            text: ['sonification', 'braille'],
            textfont: { size: [44, 18] },
            xaxis: 'x4',
            yaxis: 'y4',
          },
        ],
        layout: twoByTwoLayout({
          barmode: 'relative',
          xaxis: { domain: [0, 0.45], type: 'date' },
          yaxis: { domain: [0.575, 1], _categories: ['Design'] },
        }),
        bgRects: TWO_BY_TWO_RECTS,
        calcdata: [[{ p: 0, s: 4 * day, b: march }]],
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        // Every payload is one the core's factory recognises and can build a
        // trace from — the emitted shapes, not just the emitted type names.
        expect(figure.getSubplotSummaries().map(summary => summary.traceTypes)).toEqual([
          ['gantt'],
          ['diverging_bar'],
          ['dot'],
          ['word_cloud'],
        ]);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });

    it('a plotly choropleth reaches the core as a map of regions', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'choropleth',
          locations: ['FRA', 'DEU'],
          z: [10, 20],
          name: 'Europe',
        }],
        layout: { geo: { domain: { x: [0, 1], y: [0, 1] } } },
        calcdata: [[
          { loc: 'FRA', z: 10, ct: [2.2, 46.2] },
          { loc: 'DEU', z: 20, ct: [10.4, 51.1] },
        ]],
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.CHOROPLETH]);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });

    it('a plotly ridgeline reaches the core as one layer of curves', () => {
      const density = [
        { v: 0.1, t: 1 },
        { v: 0.4, t: 3 },
      ];
      const gd = createGraphDiv({
        traces: [
          { type: 'violin', orientation: 'h', side: 'positive', x: [1, 3], name: 'A' },
          { type: 'violin', orientation: 'h', side: 'positive', x: [2, 4], name: 'B' },
        ],
        layout: {
          xaxis: { domain: [0, 1], title: { text: 'Score' } },
          yaxis: { domain: [0, 1], _categories: ['A', 'B'] },
        },
        calcdata: [[{ pos: 0, density }], [{ pos: 1, density }]],
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.RIDGELINE]);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });

    it('a plotly polar chart reaches the core as a radar trace', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'scatterpolar',
          mode: 'lines+markers',
          subplot: 'polar',
          uid: 'aaa111',
          theta: ['Speed', 'Range', 'Comfort'],
          r: [8, 4, 6],
          name: 'Model A',
        }],
        layout: {
          polar: {
            domain: { x: [0, 1], y: [0, 1] },
            radialaxis: { title: { text: 'Score' } },
          },
        },
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      withDomGlobals(gd, () => {
        const figure = new Figure(maidr!);
        figure.applyLayout(resolveSubplotLayout(figure.subplots));

        expect(figure.subplots[0][0].traceTypes).toEqual([TraceType.RADAR]);
        expect(figure.state).toMatchObject({ empty: false });
      });
    });
  });

  describe('segmented bars', () => {
    /**
     * Two series over two quarters, the shape from issue #720:
     * Q1 totals 210 (120 East + 90 West), Q2 totals 150 (80 + 70).
     */
    function segmentedTraces(): PlotlyTrace[] {
      return [
        { type: 'bar', x: ['Q1', 'Q2'], y: [120, 80], name: 'East' },
        { type: 'bar', x: ['Q1', 'Q2'], y: [90, 70], name: 'West' },
      ];
    }

    /**
     * Calcdata as plotly leaves it for the stack above under `barnorm`,
     * mirroring what plotly.js 2.35.2 computes for these traces.
     */
    function normalizedCalcdata(scale: number): PlotlyCalcData[][] {
      const east = [scale * 120 / 210, scale * 80 / 150];
      const west = [scale * 90 / 210, scale * 70 / 150];
      return [
        [
          { p: 0, s: east[0], b: 0, y: east[0] },
          { p: 1, s: east[1], b: 0, y: east[1] },
        ],
        // Plotly puts the running top of the stack on `y`; only `s` is this
        // segment's own share.
        [
          { p: 0, s: west[0], b: east[0], y: scale },
          { p: 1, s: west[1], b: east[1], y: scale },
        ],
      ];
    }

    /**
     * The same two series under `barmode: 'group'`. Plotly scales grouped bars
     * under `barnorm` as well, but they stand side by side on a shared
     * baseline, so each bar's top is its own size.
     */
    function groupedCalcdata(): PlotlyCalcData[][] {
      const east = [100 * 120 / 210, 100 * 80 / 150];
      const west = [100 * 90 / 210, 100 * 70 / 150];
      return [
        [
          { p: 0, s: east[0], b: 0, y: east[0] },
          { p: 1, s: east[1], b: 0, y: east[1] },
        ],
        [
          { p: 0, s: west[0], b: 0, y: west[0] },
          { p: 1, s: west[1], b: 0, y: west[1] },
        ],
      ];
    }

    function segmentedData(gd: PlotlyGraphDiv): SegmentedPoint[][] {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0].data as SegmentedPoint[][];
    }

    it('announces the normalized percentage plotly drew, not the raw total', () => {
      const gd = createGraphDiv({
        traces: segmentedTraces(),
        layout: { barmode: 'stack', barnorm: 'percent' },
        calcdata: normalizedCalcdata(100),
      });

      const maidr = extractPlotlyData(gd);

      const layer = maidr!.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.NORMALIZED);
      const data = layer.data as SegmentedPoint[][];
      expect(data[0][0].x).toBe('Q1');
      expect(data[0][0].y).toBeCloseTo(57.142857, 5);
      expect(data[0][1].y).toBeCloseTo(53.333333, 5);
      // The second series reads its own share, not the stack top of 100.
      expect(data[1][0].y).toBeCloseTo(42.857143, 5);
      expect(data[1][1].y).toBeCloseTo(46.666667, 5);
    });

    it('announces fractions when barnorm is fraction', () => {
      const gd = createGraphDiv({
        traces: segmentedTraces(),
        layout: { barmode: 'stack', barnorm: 'fraction' },
        calcdata: normalizedCalcdata(1),
      });

      const data = segmentedData(gd);

      expect(data[0][0].y).toBeCloseTo(0.571429, 5);
      expect(data[1][0].y).toBeCloseTo(0.428571, 5);
    });

    it('normalizes grouped bars, which plotly scales under barnorm as well', () => {
      const gd = createGraphDiv({
        traces: segmentedTraces(),
        layout: { barmode: 'group', barnorm: 'percent' },
        calcdata: groupedCalcdata(),
      });

      const maidr = extractPlotlyData(gd);

      const layer = maidr!.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.DODGED);
      const data = layer.data as SegmentedPoint[][];
      expect(data[0][0].y).toBeCloseTo(57.142857, 5);
      expect(data[1][0].y).toBeCloseTo(42.857143, 5);
    });

    it('normalizes horizontal bars on the value axis, keeping the category on y', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', orientation: 'h', y: ['Q1', 'Q2'], x: [120, 80], name: 'East' },
          { type: 'bar', orientation: 'h', y: ['Q1', 'Q2'], x: [90, 70], name: 'West' },
        ],
        layout: { barmode: 'stack', barnorm: 'percent' },
        // For horizontal bars plotly keeps the size on `s` and moves the
        // running total to `x`. `y` holds the numeric position, not the
        // category, which is why the label has to come from the trace.
        calcdata: [
          [{ p: 0, s: 100 * 120 / 210, b: 0, x: 100 * 120 / 210, y: 0 }, { p: 1, s: 100 * 80 / 150, b: 0, x: 100 * 80 / 150, y: 1 }],
          [{ p: 0, s: 100 * 90 / 210, b: 100 * 120 / 210, x: 100, y: 0 }, { p: 1, s: 100 * 70 / 150, b: 100 * 80 / 150, x: 100, y: 1 }],
        ],
      });

      const data = segmentedData(gd);

      expect(data[0][0].y).toBe('Q1');
      expect(data[0][0].x).toBeCloseTo(57.142857, 5);
      expect(data[1][0].y).toBe('Q1');
      expect(data[1][0].x).toBeCloseTo(42.857143, 5);
    });

    it('leaves an unnormalized stack reading its raw values', () => {
      const gd = createGraphDiv({
        traces: segmentedTraces(),
        layout: { barmode: 'stack' },
        calcdata: [
          [{ p: 0, s: 120, b: 0, y: 120 }, { p: 1, s: 80, b: 0, y: 80 }],
          [{ p: 0, s: 90, b: 120, y: 210 }, { p: 1, s: 70, b: 80, y: 150 }],
        ],
      });

      const maidr = extractPlotlyData(gd);

      const layer = maidr!.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.STACKED);
      const data = layer.data as SegmentedPoint[][];
      expect(data[0][0].y).toBe(120);
      // 210 is the stack top, not this segment.
      expect(data[1][0].y).toBe(90);
    });

    it('falls back to the raw trace values when calcdata is unavailable', () => {
      const gd = createGraphDiv({
        traces: segmentedTraces(),
        layout: { barmode: 'stack', barnorm: 'percent' },
      });

      const data = segmentedData(gd);

      expect(data[0][0].y).toBe(120);
      expect(data[1][0].y).toBe(90);
    });

    it('normalizes a lone bar trace, which barnorm flattens to full-height bars', () => {
      // Plotly normalizes a single trace against itself, so every bar is drawn
      // at 100% — verified against plotly.js 2.35.2, where raw [120, 80, 40]
      // renders three identical full-height bars. Announcing the raw numbers
      // there describes three different heights that are not on screen.
      // A lone bar trace takes the single-layer path, not the segmented one.
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1', 'Q2', 'Q3'], y: [120, 80, 40], name: 'East' }],
        layout: { barmode: 'stack', barnorm: 'percent' },
        calcdata: [[
          { p: 0, s: 100, b: 0, y: 100 },
          { p: 1, s: 100, b: 0, y: 100 },
          { p: 2, s: 100, b: 0, y: 100 },
        ]],
      });

      const maidr = extractPlotlyData(gd);

      const layer = maidr!.subplots[0][0].layers[0];
      expect(layer.type).toBe(TraceType.BAR);
      const data = layer.data as BarPoint[];
      expect(data.map(point => point.y)).toEqual([100, 100, 100]);
      expect(data.map(point => point.x)).toEqual(['Q1', 'Q2', 'Q3']);
    });

    it('leaves a lone bar trace without barnorm reading its raw values', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'bar', x: ['Q1', 'Q2', 'Q3'], y: [120, 80, 40], name: 'East' }],
        layout: {},
        calcdata: [[
          { p: 0, s: 120, b: 0, y: 120 },
          { p: 1, s: 80, b: 0, y: 80 },
          { p: 2, s: 40, b: 0, y: 40 },
        ]],
      });

      const maidr = extractPlotlyData(gd);

      const data = maidr!.subplots[0][0].layers[0].data as BarPoint[];
      expect(data.map(point => point.y)).toEqual([120, 80, 40]);
    });

    it('reports a bar normalized to zero as 0, not as missing', () => {
      // A 0% share is a real value: it has to reach the announcement rather
      // than be dropped or replaced. Note this does not distinguish a
      // falsy-check fallback from a nullish one — under `barnorm` a drawn 0
      // implies a raw 0, so both would answer 0 here. What it pins is that
      // the zero survives extraction at all.
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['Q1', 'Q2'], y: [0, 80], name: 'East' },
          { type: 'bar', x: ['Q1', 'Q2'], y: [90, 70], name: 'West' },
        ],
        layout: { barmode: 'stack', barnorm: 'percent' },
        calcdata: [
          [{ p: 0, s: 0, b: 0, y: 0 }, { p: 1, s: 100 * 80 / 150, b: 0, y: 100 * 80 / 150 }],
          [{ p: 0, s: 100, b: 0, y: 100 }, { p: 1, s: 100 * 70 / 150, b: 100 * 80 / 150, y: 100 }],
        ],
      });

      const data = segmentedData(gd);

      expect(data[0][0].y).toBe(0);
      expect(data[1][0].y).toBe(100);
    });

    it('keeps calcdata aligned with the trace arrays across a gap in the data', () => {
      // Plotly's bar calc() holds a missing point in place rather than
      // dropping it — the entry keeps its position and carries `s: undefined`
      // (BADNUM) — so `cd[i]` stays in step with `x[i]`/`y[i]`. Verified
      // against plotly.js 2.35.2: four input points, four calcdata entries,
      // four rendered bars. Were an entry dropped instead, every value after
      // the gap would slide onto the wrong quarter.
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      // Plotly's runtime data admits null; the hand-written trace type does not.
      const withGaps = (values: (number | null)[]): number[] => values as number[];
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: quarters, y: withGaps([120, null, 60, 40]), name: 'East' },
          { type: 'bar', x: quarters, y: withGaps([90, 70, null, 20]), name: 'West' },
        ],
        layout: { barmode: 'stack', barnorm: 'percent' },
        calcdata: [
          [
            { p: 0, s: 100 * 120 / 210, b: 0, y: 100 * 120 / 210 },
            { p: 1 },
            // West is absent at Q3, so East is the whole stack there.
            { p: 2, s: 100, b: 0, y: 100 },
            { p: 3, s: 100 * 40 / 60, b: 0, y: 100 * 40 / 60 },
          ],
          [
            { p: 0, s: 100 * 90 / 210, b: 100 * 120 / 210, y: 100 },
            { p: 1, s: 100, b: 0, y: 100 },
            { p: 2 },
            { p: 3, s: 100 * 20 / 60, b: 100 * 40 / 60, y: 100 },
          ],
        ],
      });

      const data = segmentedData(gd);

      // The points after each gap keep their own share. A one-entry shift
      // would report 66.67 at Q3 and 100 at Q4 instead.
      expect(data[0][2].y).toBeCloseTo(100, 5);
      expect(data[0][3].y).toBeCloseTo(66.666667, 5);
      expect(data[1][3].y).toBeCloseTo(33.333333, 5);
      expect(data[1][1].y).toBeCloseTo(100, 5);
      // A gap itself carries the raw value through, exactly as before the fix.
      // Deliberately not filtered the way extractMultiLineLayer filters line
      // gaps: plotly omits a null point from a line's DOM but keeps a
      // zero-height rect for a bar's, so dropping it here would slide every
      // later bar's highlight onto its neighbour. The text service already
      // renders the null as "missing" rather than announcing it raw.
      expect(data[0][1].y).toBeNull();
      expect(data[1][2].y).toBeNull();
      // Category labels still come from the trace, so they survive the gaps.
      expect(data[0].map(point => point.x)).toEqual(quarters);
    });
  });

  describe('area traces', () => {
    const SINGLE_PANEL = {
      xaxis: { domain: [0, 1] as [number, number] },
      yaxis: { domain: [0, 1] as [number, number] },
    };

    function areaTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'scatter',
        mode: 'lines',
        x: ['Q1', 'Q2'],
        y: [120, 80],
        fill: 'tozeroy',
        ...overrides,
      };
    }

    function layersOf(gd: PlotlyGraphDiv): MaidrLayer[] {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers;
    }

    it('binds a filled scatter as an area layer, shaped like a line', () => {
      const layers = layersOf(createGraphDiv({
        traces: [areaTrace({ name: 'East' })],
        layout: SINGLE_PANEL,
      }));

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.AREA);
      expect(layers[0].data).toEqual([[
        { x: 'Q1', y: 120, z: 'East' },
        { x: 'Q2', y: 80, z: 'East' },
      ]]);
    });

    it('leaves an unfilled scatter a line', () => {
      const layers = layersOf(createGraphDiv({
        traces: [areaTrace({ fill: 'none' })],
        layout: SINGLE_PANEL,
      }));

      expect(layers[0].type).toBe(TraceType.LINE);
    });

    it('keeps a filled staircase a step, whose convention still describes it', () => {
      const layers = layersOf(createGraphDiv({
        traces: [areaTrace({ line: { shape: 'hv' } })],
        layout: SINGLE_PANEL,
      }));

      expect(layers[0].type).toBe(TraceType.STEP);
      expect(layers[0].stepDirection).toBe('hv');
    });

    it('merges independent bands into one multi-series area layer', () => {
      const layers = layersOf(createGraphDiv({
        traces: [
          areaTrace({ name: 'East' }),
          areaTrace({ name: 'West', y: [90, 70] }),
        ],
        layout: SINGLE_PANEL,
      }));

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.AREA);
      expect(layers[0].data).toHaveLength(2);
    });

    it('binds a stackgroup as a stacked area carrying each band\'s own value', () => {
      const layers = layersOf(createGraphDiv({
        traces: [
          areaTrace({ name: 'East', stackgroup: 'one' }),
          areaTrace({ name: 'West', y: [90, 70], stackgroup: 'one' }),
        ],
        layout: SINGLE_PANEL,
      }));

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.STACKED_AREA);
      // Not the running total (210/150): AreaTrace accumulates the bands
      // itself, and pre-accumulated values would be counted twice.
      expect(layers[0].data).toEqual([
        [{ x: 'Q1', y: 120, z: 'East' }, { x: 'Q2', y: 80, z: 'East' }],
        [{ x: 'Q1', y: 90, z: 'West' }, { x: 'Q2', y: 70, z: 'West' }],
      ]);
    });

    it('keeps two stack groups apart, so neither invents the other\'s total', () => {
      const layers = layersOf(createGraphDiv({
        traces: [
          areaTrace({ name: 'East', stackgroup: 'sales' }),
          areaTrace({ name: 'North', y: [5, 6], stackgroup: 'costs' }),
        ],
        layout: SINGLE_PANEL,
      }));

      expect(layers.map(layer => layer.type)).toEqual([
        TraceType.STACKED_AREA,
        TraceType.STACKED_AREA,
      ]);
      expect(layers.map(layer => (layer.data as unknown[]).length)).toEqual([1, 1]);
    });

    it('binds a normalized stackgroup as its own type', () => {
      const layers = layersOf(createGraphDiv({
        traces: [
          areaTrace({ name: 'East', stackgroup: 'one', groupnorm: 'percent' }),
          areaTrace({ name: 'West', y: [90, 70], stackgroup: 'one', groupnorm: 'percent' }),
        ],
        layout: SINGLE_PANEL,
      }));

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.NORMALIZED_AREA);
    });

    it('announces the rescaled band heights plotly drew for a normalized stack', () => {
      const gd = createGraphDiv({
        traces: [
          areaTrace({ name: 'East', stackgroup: 'one', groupnorm: 'percent' }),
          areaTrace({ name: 'West', y: [90, 70], stackgroup: 'one', groupnorm: 'percent' }),
        ],
        layout: SINGLE_PANEL,
        // As plotly leaves it: `sNorm` is the band's own rescaled height and
        // `y` the running top of the stack.
        calcdata: [
          [
            { x: 0, s: 120, sNorm: 100 * 120 / 210, y: 100 * 120 / 210 },
            { x: 1, s: 80, sNorm: 100 * 80 / 150, y: 100 * 80 / 150 },
          ],
          [
            { x: 0, s: 90, sNorm: 100 * 90 / 210, y: 100 },
            { x: 1, s: 70, sNorm: 100 * 70 / 150, y: 100 },
          ],
        ],
      });

      const data = layersOf(gd)[0].data as LinePoint[][];

      expect(data[0][0].y).toBeCloseTo(57.142857, 5);
      expect(data[1][0].y).toBeCloseTo(42.857143, 5);
      expect(data[0][1].y).toBeCloseTo(53.333333, 5);
      expect(data[1][1].y).toBeCloseTo(46.666667, 5);
    });

    it('drops the positions plotly interleaved into a stack from another band', () => {
      const gd = createGraphDiv({
        traces: [
          areaTrace({ name: 'East', stackgroup: 'one', groupnorm: 'percent' }),
          // West has nothing at Q2, so plotly splices a blank into its
          // calcdata to line the two bands up.
          areaTrace({ name: 'West', x: ['Q1'], y: [90], stackgroup: 'one', groupnorm: 'percent' }),
        ],
        layout: SINGLE_PANEL,
        calcdata: [
          [
            { x: 0, sNorm: 100 * 120 / 210 },
            { x: 1, sNorm: 100 },
          ],
          [
            { x: 0, sNorm: 100 * 90 / 210 },
            { x: 1, i: null, s: 0, sNorm: 0 },
          ],
        ],
      });

      const data = layersOf(gd)[0].data as LinePoint[][];

      // West keeps its one authored sample; the interleaved blank is not one.
      expect(data[1]).toHaveLength(1);
      expect(data[1][0].y).toBeCloseTo(42.857143, 5);
    });

    it('falls back to the authored values when plotly computed no calcdata', () => {
      const layers = layersOf(createGraphDiv({
        traces: [areaTrace({ name: 'East', stackgroup: 'one', groupnorm: 'percent' })],
        layout: SINGLE_PANEL,
      }));

      expect(layers[0].data).toEqual([[
        { x: 'Q1', y: 120, z: 'East' },
        { x: 'Q2', y: 80, z: 'East' },
      ]]);
    });

    it('highlights the markers of an area drawn with them', () => {
      const layers = layersOf(createGraphDiv({
        traces: [areaTrace({ mode: 'lines+markers', stackgroup: 'one' })],
        layout: SINGLE_PANEL,
      }));

      expect(layers[0].selectors).toBe('.subplot.xy .trace.scatter .point');
    });

    it('leaves a lines-only area unhighlighted, as it leaves a line', () => {
      const layers = layersOf(createGraphDiv({
        traces: [areaTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layers[0].selectors).toBeUndefined();
    });

    it('does not warn about an area trace, which is supported', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        extractPlotlyData(createGraphDiv({
          traces: [areaTrace({ stackgroup: 'one' })],
          layout: SINGLE_PANEL,
        }));

        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('funnel traces', () => {
    const SINGLE_PANEL = {
      xaxis: { title: { text: 'Users' }, domain: [0, 1] as [number, number] },
      yaxis: { title: { text: 'Stage' }, domain: [0, 1] as [number, number] },
    };

    /** The default funnel shape: counts on x, stages on y, drawn sideways. */
    function funnelTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'funnel',
        orientation: 'h',
        y: ['Visited', 'Signed up', 'Purchased'],
        x: [10000, 2400, 100],
        name: 'Conversion',
        ...overrides,
      };
    }

    function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('binds a funnel trace as a funnel layer, in the authored stage order', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [funnelTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.FUNNEL);
      expect(layer.title).toBe('Conversion');
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      // The count sits on the axis it was drawn against, which is where
      // AbstractBarPlot reads a horizontal bar's value from.
      expect(layer.data).toEqual([
        { x: 10000, y: 'Visited' },
        { x: 2400, y: 'Signed up' },
        { x: 100, y: 'Purchased' },
      ]);
      expect(layer.axes?.x?.label).toBe('Users');
      expect(layer.axes?.y?.label).toBe('Stage');
    });

    it('prefers the size plotly computed over the authored one', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [funnelTrace()],
        layout: SINGLE_PANEL,
        calcdata: [[{ p: 0, s: 9000 }, { p: 1, s: 2400 }, { p: 2, s: 100 }]],
      }));

      expect((layer.data as BarPoint[])[0].x).toBe(9000);
    });

    it('scopes the highlight to the funnel layer, not to a neighbouring bar', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [funnelTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layer.selectors).toBe('.subplot.xy .funnellayer .trace.bars .point > path');
    });

    it('keeps a vertical funnel on the value axis it was drawn against', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [funnelTrace({
          orientation: 'v',
          x: ['Visited', 'Signed up'],
          y: [10000, 2400],
        })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.orientation).toBeUndefined();
      expect(layer.data).toEqual([
        { x: 'Visited', y: 10000 },
        { x: 'Signed up', y: 2400 },
      ]);
    });
  });

  describe('candlestick and OHLC traces', () => {
    const SINGLE_PANEL = {
      xaxis: { title: { text: 'Date' }, domain: [0, 1] as [number, number] },
      yaxis: { title: { text: 'Price' }, domain: [0, 1] as [number, number] },
    };

    function candlestickTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'candlestick',
        x: ['d1', 'd2', 'd3', 'd4'],
        open: [1, 2, 3, 2.5],
        high: [2, 3, 4, 3.2],
        low: [0, 1, 2, 1.8],
        close: [1.5, 2.5, 3.5, 2],
        name: 'ACME',
        ...overrides,
      };
    }

    function layersOf(gd: PlotlyGraphDiv): MaidrLayer[] {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers;
    }

    it('scopes the selector to the panel, leaving the rangeslider out', () => {
      // Plotly gives a candlestick chart a rangeslider *by default*, and it
      // holds a complete second copy of the plot. Measured in Chromium for
      // this four-candle chart:
      //
      //   .trace.boxes .box                                     8   ** the copy
      //   .subplot.xy .boxlayer > .trace.boxes:nth-child(1) …   4
      //
      // The duplicate sits under `g.rangeslider-rangeplot.xy`, which carries
      // the `xy` class but not `subplot` — so the prefix is what excludes it.
      // Unscoped, the index-to-element mapping was wrong for every candle and
      // half the highlights landed in the thumbnail.
      const [layer] = layersOf(createGraphDiv({
        traces: [candlestickTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.CANDLESTICK);
      expect(layer.selectors).toBe(
        '.subplot.xy .boxlayer > .trace.boxes:nth-child(1) path.box',
      );
    });

    it('counts past a box plot sharing the same layer', () => {
      // A `go.Box` draws into `g.boxlayer` too, and emits its own `path.box`.
      // Measured: one box beside this four-candle trace makes
      // `.subplot.xy .trace.boxes path.box` match five, and the candlestick's
      // marks are the *second* group's.
      const layers = layersOf(createGraphDiv({
        traces: [
          { type: 'box', y: [1, 2, 3, 4], name: 'spread' },
          candlestickTrace(),
        ],
        layout: SINGLE_PANEL,
      }));

      const candlestick = layers.find(l => l.type === TraceType.CANDLESTICK);
      expect(candlestick?.selectors).toBe(
        '.subplot.xy .boxlayer > .trace.boxes:nth-child(2) path.box',
      );
    });

    it('keeps the first slot when the candlestick is declared first', () => {
      // The mirror of the case above. `boxlayer` children follow `_fullData`
      // order — verified in Chromium with three interleaved traces, unlike
      // `.scatterlayer`, whose groups are in fill z-order.
      const layers = layersOf(createGraphDiv({
        traces: [
          candlestickTrace(),
          { type: 'box', y: [1, 2, 3, 4], name: 'spread' },
        ],
        layout: SINGLE_PANEL,
      }));

      const candlestick = layers.find(l => l.type === TraceType.CANDLESTICK);
      expect(candlestick?.selectors).toBe(
        '.subplot.xy .boxlayer > .trace.boxes:nth-child(1) path.box',
      );
    });

    it('does not count a violin or a scatter, which draw in other layers', () => {
      // A `go.Violin` draws into `g.violinlayer` and a scatter into
      // `g.scatterlayer`, so neither takes a `boxlayer` slot. Counting every
      // preceding trace instead would push this one to a group that does not
      // exist — and a selector matching nothing loses the highlight silently,
      // with the audio and text still correct, so nothing else would report it.
      const layers = layersOf(createGraphDiv({
        traces: [
          { type: 'violin', y: [1, 2, 3, 4], name: 'shape' },
          scatterTrace({ name: 'points' }),
          candlestickTrace(),
        ],
        layout: SINGLE_PANEL,
      }));

      const candlestick = layers.find(l => l.type === TraceType.CANDLESTICK);
      expect(candlestick?.selectors).toBe(
        '.subplot.xy .boxlayer > .trace.boxes:nth-child(1) path.box',
      );
    });

    it('reads an OHLC trace as a candlestick', () => {
      // `ohlc` carries the same four numbers and differs only in how plotly
      // draws a bar. Before this it mapped to no MAIDR type at all, so the
      // trace was dropped and the chart announced nothing.
      const [layer] = layersOf(createGraphDiv({
        traces: [candlestickTrace({ type: 'ohlc' })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.CANDLESTICK);
      expect(layer.data).toEqual([
        { value: 'd1', open: 1, high: 2, low: 0, close: 1.5, volume: undefined, trend: 'Bull', volatility: 2 },
        { value: 'd2', open: 2, high: 3, low: 1, close: 2.5, volume: undefined, trend: 'Bull', volatility: 2 },
        { value: 'd3', open: 3, high: 4, low: 2, close: 3.5, volume: undefined, trend: 'Bull', volatility: 2 },
        { value: 'd4', open: 2.5, high: 3.2, low: 1.8, close: 2, volume: undefined, trend: 'Bear', volatility: 3.2 - 1.8 },
      ]);
    });

    it('addresses an OHLC trace in its own layer', () => {
      // Measured: `ohlc` draws into `g.ohlclayer > g.trace.ohlc > path`, not
      // into `boxlayer`. A shared selector would match nothing for it, which
      // is a silent loss rather than a visible one.
      const [layer] = layersOf(createGraphDiv({
        traces: [candlestickTrace({ type: 'ohlc' })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.selectors).toBe(
        '.subplot.xy .ohlclayer > .trace.ohlc:nth-child(1) > path',
      );
    });

    it('counts OHLC traces among themselves, not among box-family ones', () => {
      // The two layers are independent, so a box before an OHLC trace must
      // not push it out of the first `ohclayer` slot, and a candlestick must
      // not either.
      const layers = layersOf(createGraphDiv({
        traces: [
          { type: 'box', y: [1, 2, 3, 4], name: 'spread' },
          candlestickTrace({ name: 'candles' }),
          candlestickTrace({ type: 'ohlc', name: 'bars' }),
        ],
        layout: SINGLE_PANEL,
      }));

      const selectors = layers
        .filter(l => l.type === TraceType.CANDLESTICK)
        .map(l => l.selectors);

      expect(selectors).toEqual([
        '.subplot.xy .boxlayer > .trace.boxes:nth-child(2) path.box',
        '.subplot.xy .ohlclayer > .trace.ohlc:nth-child(1) > path',
      ]);
    });

    it('scopes a candlestick on a second panel to that panel', () => {
      // Two panels each holding one candlestick both sit at the first slot of
      // their own `boxlayer`, so the axis pair is the only thing telling them
      // apart.
      const gd = createGraphDiv({
        traces: [
          candlestickTrace(),
          candlestickTrace({ xaxis: 'x2', yaxis: 'y2', name: 'OTHER' }),
        ],
        layout: {
          xaxis: { title: { text: 'Date' }, domain: [0, 0.45] },
          yaxis: { title: { text: 'Price' }, domain: [0, 1] },
          xaxis2: { title: { text: 'Date' }, domain: [0.55, 1] },
          yaxis2: { title: { text: 'Price' }, domain: [0, 1] },
        },
        bgRects: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      });

      const maidr = extractPlotlyData(gd);
      const selectors = maidr!.subplots
        .flat()
        .flatMap(subplot => subplot.layers.map(layer => layer.selectors));

      expect(selectors).toEqual([
        '.subplot.xy .boxlayer > .trace.boxes:nth-child(1) path.box',
        '.subplot.x2y2 .boxlayer > .trace.boxes:nth-child(1) path.box',
      ]);
    });
  });

  describe('waterfall traces', () => {
    const SINGLE_PANEL = {
      xaxis: { title: { text: 'Step' }, domain: [0, 1] as [number, number] },
      yaxis: { title: { text: 'Amount' }, domain: [0, 1] as [number, number] },
    };

    function waterfallTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'waterfall',
        x: ['Opening', 'Sales', 'Returns', 'Closing'],
        y: [1000, 400, -150, 0],
        measure: ['absolute', 'relative', 'relative', 'total'],
        name: 'Revenue',
        ...overrides,
      };
    }

    function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('accumulates the authored steps when plotly computed no calcdata', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [waterfallTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.WATERFALL);
      expect(layer.title).toBe('Revenue');
      expect(layer.data).toEqual([
        { x: 'Opening', start: 0, end: 1000, delta: 1000, kind: 'total' },
        { x: 'Sales', start: 1000, end: 1400, delta: 400, kind: 'increase' },
        { x: 'Returns', start: 1400, end: 1250, delta: -150, kind: 'decrease' },
        { x: 'Closing', start: 0, end: 1250, delta: 1250, kind: 'total' },
      ]);
    });

    it('reads the running totals plotly computed in preference to its own', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [waterfallTrace()],
        layout: SINGLE_PANEL,
        // As plotly leaves it: `v` is the total after the step, `rawS` the
        // authored contribution, `s` the accumulated size it draws with.
        // The amounts deliberately disagree with the trace's own arrays, so
        // falling back to `authoredWaterfallSteps` fails this outright rather
        // than passing on identical numbers.
        calcdata: [[
          { p: 0, s: 1100, rawS: 1100, isSum: true, v: 1100 },
          { p: 1, s: 1500, rawS: 400, isSum: false, v: 1500 },
          { p: 2, s: 1300, rawS: -200, isSum: false, v: 1300 },
          { p: 3, s: 1300, rawS: 0, isSum: true, v: 1300 },
        ]],
      }));

      expect(layer.data).toEqual([
        { x: 'Opening', start: 0, end: 1100, delta: 1100, kind: 'total' },
        { x: 'Sales', start: 1100, end: 1500, delta: 400, kind: 'increase' },
        { x: 'Returns', start: 1500, end: 1300, delta: -200, kind: 'decrease' },
        { x: 'Closing', start: 0, end: 1300, delta: 1300, kind: 'total' },
      ]);
    });

    it('measures the steps from the trace base', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [waterfallTrace({
          x: ['Sales'],
          y: [400],
          measure: ['relative'],
          base: 500,
        })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.data).toEqual([
        { x: 'Sales', start: 500, end: 900, delta: 400, kind: 'increase' },
      ]);
    });

    it('swaps the axis labels of a horizontal waterfall, which reads them fixed', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [waterfallTrace({
          orientation: 'h',
          y: ['Opening', 'Sales'],
          x: [1000, 400],
          measure: ['absolute', 'relative'],
        })],
        // Drawn sideways, so plotly's x carries the amounts and its y the
        // steps — the opposite of how the layer has to name them.
        layout: {
          xaxis: { title: { text: 'Amount' }, domain: [0, 1] },
          yaxis: { title: { text: 'Step' }, domain: [0, 1] },
        },
      }));

      // WaterfallTrace names the step with the layer's x axis and the
      // contribution with its y axis, whichever way plotly drew the bars.
      expect(layer.axes?.x?.label).toBe('Step');
      expect(layer.axes?.y?.label).toBe('Amount');
      expect(layer.data).toEqual([
        { x: 'Opening', start: 0, end: 1000, delta: 1000, kind: 'total' },
        { x: 'Sales', start: 1000, end: 1400, delta: 400, kind: 'increase' },
      ]);
    });

    it('scopes the highlight to the waterfall layer', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [waterfallTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layer.selectors).toBe('.subplot.xy .waterfalllayer .trace.bars .point > path');
    });
  });

  describe('error bar traces', () => {
    const SINGLE_PANEL = {
      xaxis: { title: { text: 'Group' }, domain: [0, 1] as [number, number] },
      yaxis: { title: { text: 'Mean' }, domain: [0, 1] as [number, number] },
    };

    function errorTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'scatter',
        mode: 'markers',
        uid: 'trt',
        x: ['A', 'B'],
        y: [4.2, 5.1],
        error_y: { visible: true, type: 'data', array: [0.4, 0.3] },
        name: 'Treatment',
        ...overrides,
      };
    }

    function onlyLayer(gd: PlotlyGraphDiv): MaidrLayer {
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('binds a scatter carrying intervals as an error bar layer', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace()],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.ERROR_BAR);
      expect(layer.title).toBe('Treatment');
      expect(layer.orientation).toBeUndefined();
      // Absolute bounds, not the offsets the trace declared.
      const data = layer.data as ErrorBarPoint[];
      expect(data.map(point => point.x)).toEqual(['A', 'B']);
      expect(data[0].yMin).toBeCloseTo(3.8, 10);
      expect(data[0].yMax).toBeCloseTo(4.6, 10);
      expect(data[1].yMin).toBeCloseTo(4.8, 10);
      expect(data[1].yMax).toBeCloseTo(5.4, 10);
    });

    it('leaves a scatter whose intervals plotly turned off a scatter', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace({
          x: [1, 2],
          error_y: { visible: false, type: 'data', array: [0.4, 0.3] },
        })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.SCATTER);
    });

    it('prefers the bounds plotly resolved over recomputing them', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace({ error_y: { visible: true, type: 'sqrt' } })],
        layout: SINGLE_PANEL,
        calcdata: [[
          { x: 0, y: 4.2, ys: 2.15, yh: 6.25 },
          { x: 1, y: 5.1, ys: 2.84, yh: 7.36 },
        ]],
      }));

      const data = layer.data as ErrorBarPoint[];
      expect(data[0]).toEqual({ x: 'A', y: 4.2, yMin: 2.15, yMax: 6.25 });
      expect(data[1]).toEqual({ x: 'B', y: 5.1, yMin: 2.84, yMax: 7.36 });
    });

    it('reads the two sides separately when the trace declared them so', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace({
          error_y: {
            visible: true,
            type: 'data',
            symmetric: false,
            array: [0.4, 0.3],
            arrayminus: [0.1, 0.2],
          },
        })],
        layout: SINGLE_PANEL,
      }));

      const data = layer.data as ErrorBarPoint[];
      expect(data[0].yMin).toBeCloseTo(4.1, 10);
      expect(data[0].yMax).toBeCloseTo(4.6, 10);
    });

    it('resolves a percentage interval against each estimate', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace({ error_y: { visible: true, type: 'percent', value: 10 } })],
        layout: SINGLE_PANEL,
      }));

      const data = layer.data as ErrorBarPoint[];
      expect(data[0].yMin).toBeCloseTo(3.78, 10);
      expect(data[0].yMax).toBeCloseTo(4.62, 10);
    });

    it('reads a horizontal interval off the axis it was drawn on', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [{
          type: 'scatter',
          mode: 'markers',
          uid: 'study',
          y: ['Study A', 'Study B'],
          x: [1.2, 0.8],
          error_x: { visible: true, type: 'data', array: [0.3, 0.2] },
        }],
        layout: SINGLE_PANEL,
      }));

      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      const data = layer.data as ErrorBarPoint[];
      expect(data[0].x).toBe('Study A');
      expect(data[0].y).toBe(1.2);
      expect(data[0].yMin).toBeCloseTo(0.9, 10);
      expect(data[0].yMax).toBeCloseTo(1.5, 10);
      expect(layer.selectors).toBe(
        '.subplot.xy .scatterlayer g.trace.tracestudy .errorbars > g.errorbar > path.xerror',
      );
    });

    it('highlights the whip a bar trace hangs off its own group', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace({ type: 'bar', mode: undefined })],
        layout: SINGLE_PANEL,
      }));

      expect(layer.type).toBe(TraceType.ERROR_BAR);
      expect(layer.selectors).toBe(
        '.subplot.xy .barlayer > g.trace.bars:nth-of-type(1) > g.errorbar > path.yerror',
      );
    });

    it('scopes each of two traces on one panel to its own whips', () => {
      const gd = createGraphDiv({
        traces: [
          errorTrace({ uid: 'ctl', name: 'Control' }),
          errorTrace({ uid: 'trt', name: 'Treatment' }),
        ],
        layout: SINGLE_PANEL,
      });

      const layers = extractPlotlyData(gd)!.subplots[0][0].layers;
      expect(layers).toHaveLength(2);
      // A panel-wide selector would hand both layers every whip on the panel,
      // and `ErrorBarTrace` drops the highlight outright on a count mismatch.
      expect(layers[0].selectors).toBe(
        '.subplot.xy .scatterlayer g.trace.tracectl .errorbars > g.errorbar > path.yerror',
      );
      expect(layers[1].selectors).toBe(
        '.subplot.xy .scatterlayer g.trace.tracetrt .errorbars > g.errorbar > path.yerror',
      );
    });

    it('counts the bar traces drawn before one carrying intervals', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['A', 'B'], y: [1, 2] },
          { type: 'bar', x: ['A', 'B'], y: [3, 4], visible: 'legendonly' },
          errorTrace({ type: 'bar', mode: undefined }),
        ],
        layout: SINGLE_PANEL,
      });

      const layers = extractPlotlyData(gd)!.subplots[0][0].layers;
      const errorLayer = layers.find(layer => layer.type === TraceType.ERROR_BAR);
      // The hidden trace gets no group in the layer, so it must not shift the
      // count; the drawn one before it must.
      expect(errorLayer?.selectors).toBe(
        '.subplot.xy .barlayer > g.trace.bars:nth-of-type(2) > g.errorbar > path.yerror',
      );
    });

    it('drops a sample plotly drew no estimate for, as it drew no whip', () => {
      const layer = onlyLayer(createGraphDiv({
        traces: [errorTrace({ x: ['A', 'B', 'C'], y: [4.2, null as unknown as number, 5.1] })],
        layout: SINGLE_PANEL,
      }));

      expect((layer.data as ErrorBarPoint[]).map(point => point.x)).toEqual(['A', 'C']);
    });
  });

  describe('hierarchy traces', () => {
    const DOMAIN = { x: [0, 1] as [number, number], y: [0, 1] as [number, number] };

    /** A tree as an author thinks of it, before plotly stratifies one. */
    interface TreeSpec {
      label: string;
      value?: number;
      children?: TreeSpec[];
    }

    /**
     * Builds the tree plotly stashes on the first calcdata entry: a d3
     * hierarchy whose nodes wrap the sector calc data two levels down, with
     * every node's children already sorted the way plotly sorts them.
     */
    function hierarchyNode(spec: TreeSpec, parent: PlotlyHierarchyNode | null = null): PlotlyHierarchyNode {
      const node: PlotlyHierarchyNode = {
        parent,
        value: spec.value,
        data: { data: { label: spec.label } },
      };
      node.children = spec.children?.map(child => hierarchyNode(child, node));
      return node;
    }

    /** The tree every case below is drawn from, largest child first. */
    const WORLD: TreeSpec = {
      label: 'World',
      value: 100,
      children: [
        {
          label: 'Asia',
          value: 60,
          children: [
            { label: 'China', value: 35 },
            { label: 'India', value: 25 },
          ],
        },
        { label: 'Europe', value: 40, children: [{ label: 'France', value: 40 }] },
      ],
    };

    function hierarchyTrace(type: string, overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type,
        // Authored smallest first at both levels, which is NOT how plotly
        // draws it: its calc sorts each node's children largest first. The two
        // orders differing is what lets the drawn-order test discriminate.
        labels: ['World', 'Europe', 'Asia', 'India', 'China', 'France'],
        parents: ['', 'World', 'World', 'Asia', 'Asia', 'Europe'],
        values: [100, 40, 60, 25, 35, 40],
        domain: DOMAIN,
        ...overrides,
      };
    }

    function hierarchyLayer(type: string, options: {
      trace?: Partial<PlotlyTrace>;
      calcdata?: PlotlyCalcData[][];
    } = {}): MaidrLayer {
      const gd = createGraphDiv({
        traces: [hierarchyTrace(type, options.trace)],
        layout: {},
        calcdata: options.calcdata,
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('reads the sectors in the order plotly drew them, deepest level last', () => {
      const layer = hierarchyLayer('sunburst', {
        calcdata: [[{ hierarchy: hierarchyNode(WORLD) }]],
      });

      expect(layer.type).toBe(TraceType.SUNBURST);
      // Level order, not the authored order: plotly draws the tree a level at
      // a time, and the `g.slice` groups sit in that order. The trace authored
      // each level's siblings the other way round, so this is the computed
      // tree's order and could not have come from the trace's own arrays.
      expect((layer.data as TreemapPoint[]).map(point => point.x)).toEqual([
        'World',
        'Asia',
        'Europe',
        'China',
        'India',
        'France',
      ]);
    });

    it('names each sector\'s ancestors root first, excluding itself', () => {
      const layer = hierarchyLayer('sunburst', {
        calcdata: [[{ hierarchy: hierarchyNode(WORLD) }]],
      });

      const data = layer.data as TreemapPoint[];
      expect(data[0]).toEqual({ x: 'World', y: 100 });
      expect(data[1]).toEqual({ x: 'Asia', y: 60, path: ['World'] });
      expect(data[3]).toEqual({ x: 'China', y: 35, path: ['World', 'Asia'] });
    });

    it.each([
      ['sunburst', TraceType.SUNBURST],
      ['icicle', TraceType.ICICLE],
      ['treemap', TraceType.TREEMAP],
    ])('binds a %s to its own layer and its own slices', (type, expected) => {
      const layer = hierarchyLayer(type, {
        calcdata: [[{ hierarchy: hierarchyNode(WORLD) }]],
      });

      expect(layer.type).toBe(expected);
      expect(layer.selectors).toBe(
        `.${type}layer > g.trace.${type}:nth-of-type(1) g.slice > path.surface`,
      );
      expect(layer.axes?.x?.label).toBe('Label');
      expect(layer.axes?.y?.label).toBe('Value');
    });

    it('falls back to the authored arrays and withholds selectors when nothing was computed', () => {
      const layer = hierarchyLayer('treemap');

      // Authored order this time, which is not the drawn order — so no
      // highlight rather than one landing on a neighbouring rectangle.
      expect((layer.data as TreemapPoint[]).map(point => point.x)).toEqual([
        'World',
        'Europe',
        'Asia',
        'India',
        'China',
        'France',
      ]);
      expect((layer.data as TreemapPoint[])[5]).toEqual({
        x: 'France',
        y: 40,
        path: ['World', 'Europe'],
      });
      expect(layer.selectors).toBeUndefined();
    });

    it.each([
      ['maxdepth', { maxdepth: 2 }],
      ['level', { level: 'Asia' }],
    ])('withholds selectors when %s trims what plotly drew', (_name, trace) => {
      const layer = hierarchyLayer('sunburst', {
        trace,
        calcdata: [[{ hierarchy: hierarchyNode(WORLD) }]],
      });

      // Plotly computed the whole tree and drew part of it, so sector k is no
      // longer slice k — no highlight beats one landing on another sector.
      expect((layer.data as TreemapPoint[])).toHaveLength(6);
      expect(layer.selectors).toBeUndefined();
    });

    it('keeps the selectors when maxdepth asks for the whole tree', () => {
      const layer = hierarchyLayer('sunburst', {
        trace: { maxdepth: -1 },
        calcdata: [[{ hierarchy: hierarchyNode(WORLD) }]],
      });

      expect(layer.selectors).toBe(
        '.sunburstlayer > g.trace.sunburst:nth-of-type(1) g.slice > path.surface',
      );
    });

    it('resolves an authored path through ids when the labels repeat', () => {
      const layer = hierarchyLayer('treemap', {
        trace: {
          labels: ['Sales', 'North', 'North'],
          ids: ['sales', 'sales/north', 'ops/north'],
          parents: ['', 'sales', 'sales'],
          values: [10, 6, 4],
        },
      });

      const data = layer.data as TreemapPoint[];
      expect(data[1]).toEqual({ x: 'North', y: 6, path: ['Sales'] });
      expect(data[2]).toEqual({ x: 'North', y: 4, path: ['Sales'] });
    });

    it('refuses the drawn order for a forest plotly gave a stand-in root', () => {
      const forest = hierarchyNode({
        label: '',
        children: [{ label: 'Asia', value: 60 }, { label: 'Europe', value: 40 }],
      });
      forest.data = { data: { label: '', hasMultipleRoots: true } };

      const layer = hierarchyLayer('sunburst', { calcdata: [[{ hierarchy: forest }]] });

      // The three layouts disagree over whether the stand-in is drawn, so the
      // sector list cannot be lined up with the slices at all.
      expect(layer.selectors).toBeUndefined();
      expect((layer.data as TreemapPoint[])[0].x).toBe('World');
    });

    it('keeps a sunburst out of the cartesian panel beside it', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'Counts' },
          hierarchyTrace('sunburst', { domain: { x: [0.55, 1], y: [0, 1] } }),
        ],
        layout: {
          xaxis: { domain: [0, 0.45], title: { text: 'Day' } },
          yaxis: { domain: [0, 1], title: { text: 'Count' } },
        },
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0]).toHaveLength(2);
      const [bars, sunburst] = maidr!.subplots[0];
      expect(bars.layers[0].type).toBe(TraceType.BAR);
      expect(sunburst.layers[0].type).toBe(TraceType.SUNBURST);
      // Not the bar panel's axis names.
      expect(sunburst.layers[0].axes?.x?.label).toBe('Label');
    });
  });

  describe('sankey traces', () => {
    const NODES = { label: ['Coal', 'Electricity', 'Losses'] };

    function sankeyTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'sankey',
        node: NODES,
        link: { source: [0, 0, 1], target: [1, 2, 2], value: [34, 8, 12] },
        domain: { x: [0, 1], y: [0, 1] },
        name: 'Energy',
        ...overrides,
      };
    }

    function sankeyLayer(options: {
      trace?: Partial<PlotlyTrace>;
      calcdata?: PlotlyCalcData[][];
    } = {}): MaidrLayer {
      const gd = createGraphDiv({
        traces: [sankeyTrace(options.trace)],
        layout: {},
        calcdata: options.calcdata,
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('names both ends of every flow plotly kept', () => {
      const layer = sankeyLayer({
        calcdata: [[{
          _links: [
            { source: 0, target: 1, value: 34 },
            { source: 0, target: 2, value: 8 },
            { source: 1, target: 2, value: 12 },
          ],
        }]],
      });

      expect(layer.type).toBe(TraceType.SANKEY);
      expect(layer.data).toEqual([
        { source: 'Coal', target: 'Electricity', value: 34 },
        { source: 'Coal', target: 'Losses', value: 8 },
        { source: 'Electricity', target: 'Losses', value: 12 },
      ]);
      expect(layer.selectors).toBe('.sankey .sankey-links > path.sankey-link');
    });

    it('reads the node objects the layout pass leaves on the links', () => {
      const layer = sankeyLayer({
        calcdata: [[{
          _links: [
            { source: { pointNumber: 0, label: 'Coal' }, target: { pointNumber: 1, label: 'Electricity' }, value: 34 },
          ],
        }]],
      });

      expect(layer.data).toEqual([{ source: 'Coal', target: 'Electricity', value: 34 }]);
    });

    it('falls back to the authored links, dropping the ones plotly would not draw', () => {
      const layer = sankeyLayer({
        trace: { link: { source: [0, 0, 1], target: [1, 2, 2], value: [34, 0, 12] } },
      });

      // The zero-weight flow is not a ribbon, and keeping it would put an
      // edge in the graph that nothing on screen corresponds to.
      expect(layer.data).toEqual([
        { source: 'Coal', target: 'Electricity', value: 34 },
        { source: 'Electricity', target: 'Losses', value: 12 },
      ]);
      expect(layer.selectors).toBeUndefined();
    });

    it('falls back to the index for a node the trace never named', () => {
      const layer = sankeyLayer({
        trace: { node: { label: ['Coal'] } },
      });

      expect(layer.data).toEqual([
        { source: 'Coal', target: 1, value: 34 },
        { source: 'Coal', target: 2, value: 8 },
        { source: 1, target: 2, value: 12 },
      ]);
    });
  });

  describe('indicator traces', () => {
    function gaugeTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'indicator',
        mode: 'gauge+number',
        value: 73,
        title: { text: 'Conversion' },
        gauge: { shape: 'angular', axis: { range: [0, 100] } },
        domain: { x: [0, 1], y: [0, 1] },
        ...overrides,
      };
    }

    function gaugeLayer(overrides: Partial<PlotlyTrace> = {}): MaidrLayer {
      const gd = createGraphDiv({ traces: [gaugeTrace(overrides)], layout: {} });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('reads the measure against the dial it was drawn on', () => {
      const layer = gaugeLayer();

      expect(layer.type).toBe(TraceType.GAUGE);
      // A single object, not an array of one: the chart draws one measure.
      expect(layer.data).toEqual({ value: 73, min: 0, max: 100, label: 'Conversion' });
      expect(layer.selectors)
        .toBe('.indicatorlayer > g.trace:nth-of-type(1) g.value-arc > path');
    });

    it('highlights the filled rectangle of a bullet chart instead of an arc', () => {
      const layer = gaugeLayer({
        gauge: { shape: 'bullet', axis: { range: [0, 100] } },
      });

      expect(layer.selectors)
        .toBe('.indicatorlayer > g.trace:nth-of-type(1) g.value-bullet > rect');
    });

    it('takes the threshold line as the target', () => {
      const layer = gaugeLayer({
        gauge: { shape: 'angular', axis: { range: [0, 100] }, threshold: { value: 80 } },
      });

      expect((layer.data as GaugePoint).target).toBe(80);
    });

    it('ignores the threshold plotly resolves to false, and a self-referencing delta', () => {
      const layer = gaugeLayer({
        mode: 'gauge+number+delta',
        gauge: { shape: 'angular', axis: { range: [0, 100] }, threshold: { value: false } },
        // Plotly defaults `delta.reference` to the measure itself, and
        // "0 above target" is not a reading.
        delta: { reference: 73 },
      });

      expect((layer.data as GaugePoint).target).toBeUndefined();
    });

    it('falls back to the delta reference the author really set', () => {
      const layer = gaugeLayer({
        mode: 'gauge+number+delta',
        delta: { reference: 65 },
      });

      expect((layer.data as GaugePoint).target).toBe(65);
    });

    it('carries the qualitative bands the author named, ascending', () => {
      const layer = gaugeLayer({
        gauge: {
          shape: 'angular',
          axis: { range: [0, 100] },
          steps: [
            { range: [75, 100], name: 'good' },
            { range: [0, 50], name: 'poor' },
            { range: [50, 75], name: 'ok' },
          ],
        },
      });

      expect((layer.data as GaugePoint).bands).toEqual([
        { to: 50, label: 'poor' },
        { to: 75, label: 'ok' },
        { to: 100, label: 'good' },
      ]);
    });

    it('withholds the bands entirely when a step went unnamed', () => {
      const layer = gaugeLayer({
        gauge: {
          shape: 'angular',
          axis: { range: [0, 100] },
          steps: [{ range: [0, 50], name: 'poor' }, { range: [50, 100] }],
        },
      });

      // Colour is what a sighted reader goes by, and there is no honest name
      // to give the second band.
      expect((layer.data as GaugePoint).bands).toBeUndefined();
    });

    it('skips an indicator that draws no gauge', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const gd = createGraphDiv({
        traces: [{
          type: 'indicator',
          mode: 'number+delta',
          value: 73,
          domain: { x: [0, 1], y: [0, 1] },
        }],
        layout: {},
      });

      try {
        expect(extractPlotlyData(gd)).toBeNull();
        const skipped = warn.mock.calls.filter(([message]) =>
          String(message).includes('no gauge to read'),
        );
        expect(skipped).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('polar traces', () => {
    const POLAR_LAYOUT: PlotlyFullLayout = {
      polar: {
        domain: { x: [0, 1], y: [0, 1] },
        radialaxis: { title: { text: 'Score' } },
      },
    };

    function polarLayer(traces: PlotlyTrace[], layout: PlotlyFullLayout = POLAR_LAYOUT): MaidrLayer {
      const gd = createGraphDiv({ traces, layout });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('reads a scatterpolar as a radar, one row per series', () => {
      const layer = polarLayer([
        {
          type: 'scatterpolar',
          mode: 'lines+markers',
          subplot: 'polar',
          uid: 'aaa111',
          theta: ['Speed', 'Range', 'Comfort'],
          r: [8, 4, 6],
          name: 'Model A',
        },
        {
          type: 'scatterpolar',
          mode: 'lines+markers',
          subplot: 'polar',
          uid: 'bbb222',
          theta: ['Speed', 'Range', 'Comfort'],
          r: [5, 7, 3],
          name: 'Model B',
        },
      ]);

      expect(layer.type).toBe(TraceType.RADAR);
      const data = layer.data as LinePoint[][];
      expect(data).toHaveLength(2);
      expect(data[0][0]).toEqual({ x: 'Speed', y: 8, z: 'Model A' });
      expect(data[1][2]).toEqual({ x: 'Comfort', y: 3, z: 'Model B' });
      // The radial axis is the only one plotly lets an author title.
      expect(layer.axes?.y?.label).toBe('Score');
      expect(layer.axes?.x?.label).toBe('Spoke');
    });

    it('names each radar series by its own uid class', () => {
      const layer = polarLayer([
        {
          type: 'scatterpolar',
          mode: 'markers',
          subplot: 'polar',
          uid: 'aaa111',
          theta: ['Speed'],
          r: [8],
        },
        {
          type: 'scatterpolar',
          mode: 'markers',
          subplot: 'polar',
          uid: 'bbb222',
          theta: ['Speed'],
          r: [5],
        },
      ]);

      // One selector per series, which is what a line-shaped layer pairs by
      // position — a single selector for the layer would resolve to nothing.
      expect(layer.selectors).toEqual([
        '.polarlayer > g.polar > g.frontplot > g.scatterlayer > g.trace.traceaaa111 .point',
        '.polarlayer > g.polar > g.frontplot > g.scatterlayer > g.trace.tracebbb222 .point',
      ]);
    });

    it('reads a barpolar as a polar area, counted within the subplot bar layer', () => {
      const layer = polarLayer([{
        type: 'barpolar',
        subplot: 'polar2',
        theta: ['N', 'E', 'S', 'W'],
        r: [12, 9, 4, 7],
        name: 'Wind',
      }], {
        polar2: { domain: { x: [0, 1], y: [0, 1] } },
      });

      expect(layer.type).toBe(TraceType.POLAR_AREA);
      expect(layer.title).toBe('Wind');
      expect(layer.selectors).toEqual([
        '.polarlayer > g.polar2 > g.frontplot > g.barlayer > g.trace:nth-of-type(1) g.point > path',
      ]);
      // No radial title on this subplot, so the magnitude keeps its generic name.
      expect(layer.axes?.y?.label).toBe('Value');
    });

    it('drops a spoke with no value rather than drawing it at the centre', () => {
      const layer = polarLayer([{
        type: 'scatterpolar',
        mode: 'markers',
        subplot: 'polar',
        uid: 'aaa111',
        theta: ['Speed', 'Range', 'Comfort'],
        r: [8, null as unknown as number, 6],
      }]);

      expect((layer.data as LinePoint[][])[0].map(point => point.x))
        .toEqual(['Speed', 'Comfort']);
    });

    it('keeps a polar subplot apart from the cartesian panel beside it', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'Counts' },
          {
            type: 'scatterpolar',
            mode: 'markers',
            subplot: 'polar',
            uid: 'aaa111',
            theta: ['N'],
            r: [3],
            name: 'Wind',
          },
        ],
        layout: {
          xaxis: { domain: [0, 0.45] },
          yaxis: { domain: [0, 1] },
          polar: { domain: { x: [0.55, 1], y: [0, 1] } },
        },
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0]).toHaveLength(2);
      expect(maidr!.subplots[0].map(panel => panel.layers[0].type))
        .toEqual([TraceType.BAR, TraceType.RADAR]);
    });
  });

  describe('parallel coordinates traces', () => {
    function parcoordsLayer(overrides: Partial<PlotlyTrace> = {}): MaidrLayer {
      const gd = createGraphDiv({
        traces: [{
          type: 'parcoords',
          domain: { x: [0, 1], y: [0, 1] },
          dimensions: [
            { label: 'mpg', values: [33, 21, 15] },
            { label: 'hp', values: [65, 110, 230] },
            { label: 'weight', values: [1800, 2600, 3200] },
          ],
          ...overrides,
        }],
        layout: {},
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('turns plotly\'s column-per-axis store into a row per observation', () => {
      const layer = parcoordsLayer();

      expect(layer.type).toBe(TraceType.PARALLEL);
      const data = layer.data as LinePoint[][];
      expect(data).toHaveLength(3);
      expect(data[0]).toEqual([
        { x: 'mpg', y: 33 },
        { x: 'hp', y: 65 },
        { x: 'weight', y: 1800 },
      ]);
      expect(data[2][2]).toEqual({ x: 'weight', y: 3200 });
    });

    it('emits no selectors, because plotly draws the lines to a canvas', () => {
      expect(parcoordsLayer().selectors).toBeUndefined();
    });

    it('leaves out an axis the author hid', () => {
      const layer = parcoordsLayer({
        dimensions: [
          { label: 'mpg', values: [33, 21] },
          { label: 'hp', values: [65, 110], visible: false },
        ],
      });

      expect((layer.data as LinePoint[][])[0]).toEqual([{ x: 'mpg', y: 33 }]);
    });

    it('reads no further than the shortest column reaches', () => {
      const layer = parcoordsLayer({
        dimensions: [
          { label: 'mpg', values: [33, 21, 15] },
          { label: 'hp', values: [65, 110] },
        ],
      });

      expect(layer.data as LinePoint[][]).toHaveLength(2);
    });
  });
  describe('ridgeline traces', () => {
    /** One halved violin, with the KDE samples plotly computed for it. */
    function ridgeCalc(pos: number): PlotlyCalcData {
      return {
        pos,
        min: 1,
        q1: 2,
        med: 3,
        q3: 4,
        max: 9,
        density: [
          { v: 0.1, t: 1 },
          { v: 0.4, t: 3 },
          { v: 0.05, t: 9 },
        ],
      };
    }

    /** Plotly's own ridgeline recipe: horizontal violins, positive half only. */
    function ridgeTraces(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace[] {
      return [
        { type: 'violin', orientation: 'h', side: 'positive', x: [1, 3, 9], name: 'A', ...overrides },
        { type: 'violin', orientation: 'h', side: 'positive', x: [2, 4, 8], name: 'B', ...overrides },
      ];
    }

    const RIDGE_LAYOUT: PlotlyFullLayout = {
      xaxis: { domain: [0, 1], title: { text: 'Score' } },
      yaxis: { domain: [0, 1], title: { text: 'Group' }, _categories: ['A', 'B'] },
    };

    function ridgeLayers(traces: PlotlyTrace[] = ridgeTraces()): MaidrLayer[] {
      const gd = createGraphDiv({
        traces,
        layout: RIDGE_LAYOUT,
        calcdata: [[ridgeCalc(0)], [ridgeCalc(1)]],
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers;
    }

    it('emits one ridgeline layer in place of the violin pair', () => {
      const layers = ridgeLayers();

      expect(layers).toHaveLength(1);
      expect(layers[0].type).toBe(TraceType.RIDGELINE);
    });

    it('reads plotly\'s density samples, curves top first', () => {
      const data = ridgeLayers()[0].data as ViolinKdePoint[][];

      // The last trace is drawn at the top of a horizontal position axis, and
      // the ridgeline trace reverses nothing of its own.
      expect(data.map(curve => curve[0].x)).toEqual(['B', 'A']);
      expect(data[0][1]).toEqual({ x: 'B', y: 3, density: 0.4 });
    });

    it('names the value axis and the density, one selector per curve', () => {
      const layer = ridgeLayers()[0];

      expect(layer.axes?.x?.label).toBe('Score');
      expect(layer.axes?.z?.label).toBe('Density');
      expect(layer.selectors).toEqual([
        '.subplot.xy .violinlayer > g:nth-child(2) > path.violin:nth-child(1)',
        '.subplot.xy .violinlayer > g:nth-child(1) > path.violin:nth-child(1)',
      ]);
    });

    it('keeps the violin pair when only some of the violins are halved', () => {
      const layers = ridgeLayers([
        { type: 'violin', orientation: 'h', side: 'positive', x: [1, 3, 9], name: 'A' },
        { type: 'violin', orientation: 'h', x: [2, 4, 8], name: 'B' },
      ]);

      expect(layers.map(layer => layer.type)).toEqual([
        TraceType.VIOLIN_BOX,
        TraceType.VIOLIN_KDE,
      ]);
    });
  });

  describe('gantt traces', () => {
    const DAY = 86400000;
    const MARCH_1 = Date.UTC(2024, 2, 1);

    /** A timeline as `plotly.express.timeline` emits one: bars floated on dates. */
    function timelineTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'bar',
        orientation: 'h',
        base: [MARCH_1, MARCH_1 + 4 * DAY],
        x: [4 * DAY, 6 * DAY],
        y: ['Design', 'Build'],
        name: 'Team A',
        ...overrides,
      };
    }

    /**
     * The lane axis as plotly resolves it for a timeline: categories, with the
     * range reversed so the first task sits at the top.
     */
    function timelineLayout(extra: Partial<PlotlyFullLayout> = {}): PlotlyFullLayout {
      return {
        xaxis: { domain: [0, 1], type: 'date', title: { text: 'Date' } },
        yaxis: {
          domain: [0, 1],
          type: 'category',
          title: { text: 'Task' },
          _categories: ['Design', 'Build', 'Ship'],
          range: [2.5, -0.5],
        },
        ...extra,
      };
    }

    function ganttLayer(
      traces: PlotlyTrace[] = [timelineTrace()],
      calcdata?: PlotlyCalcData[][],
    ): MaidrLayer {
      const gd = createGraphDiv({
        traces,
        layout: timelineLayout(),
        calcdata: calcdata ?? [[
          { p: 0, s: 4 * DAY, b: MARCH_1 },
          { p: 1, s: 6 * DAY, b: MARCH_1 + 4 * DAY },
        ]],
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      const layers = maidr!.subplots[0][0].layers;
      expect(layers).toHaveLength(1);
      return layers[0];
    }

    it('reads the intervals plotly floated onto the date axis', () => {
      const layer = ganttLayer();

      expect(layer.type).toBe(TraceType.GANTT);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      const data = layer.data as GanttData;
      // Scaled into the unit the lengths are announced in, so a task reads as
      // four days rather than as 345,600,000.
      expect(data.points[0]).toEqual([
        { x: 'Design', start: MARCH_1 / DAY, end: MARCH_1 / DAY + 4 },
      ]);
      expect(data.unit).toBe('days');
    });

    it('keeps a lane nothing was booked in', () => {
      const data = ganttLayer().data as GanttData;

      expect(data.lanes).toEqual(['Design', 'Build', 'Ship']);
      expect(data.points[2]).toEqual([]);
    });

    it('takes the axis format back to the instant the position names', () => {
      const format = ganttLayer().axes?.x?.format;

      expect(format?.function).toContain('new Date(value * 86400000)');
      // eslint-disable-next-line no-new-func
      const render = new Function('value', format!.function!) as (v: number) => string;
      expect(render(MARCH_1 / DAY)).toContain('2024');
    });

    it('addresses each interval by its own bar', () => {
      expect(ganttLayer().selectors).toEqual([
        '.subplot.xy .barlayer > g.trace.bars:nth-of-type(1) > g.points > g.point:nth-of-type(1) > path',
        '.subplot.xy .barlayer > g.trace.bars:nth-of-type(1) > g.points > g.point:nth-of-type(2) > path',
      ]);
    });

    it('merges the traces plotly.express splits a schedule into by colour', () => {
      const layer = ganttLayer(
        [
          timelineTrace({ base: [MARCH_1], x: [4 * DAY], y: ['Design'], name: 'Alice' }),
          timelineTrace({ base: [MARCH_1 + 4 * DAY], x: [6 * DAY], y: ['Design'], name: 'Bob' }),
        ],
        [
          [{ p: 0, s: 4 * DAY, b: MARCH_1 }],
          [{ p: 0, s: 6 * DAY, b: MARCH_1 + 4 * DAY }],
        ],
      );

      const data = layer.data as GanttData;
      expect(data.points[0]).toHaveLength(2);
      expect(layer.selectors).toEqual([
        '.subplot.xy .barlayer > g.trace.bars:nth-of-type(1) > g.points > g.point:nth-of-type(1) > path',
        '.subplot.xy .barlayer > g.trace.bars:nth-of-type(2) > g.points > g.point:nth-of-type(1) > path',
      ]);
    });

    it('parses the dates plotly.py writes as strings when calcdata is absent', () => {
      const layer = ganttLayer(
        [timelineTrace({ base: ['2024-03-01T00:00:00Z'], x: [2 * DAY], y: ['Design'] })],
        [],
      );

      const data = layer.data as GanttData;
      expect(data.points[0][0].start).toBe(MARCH_1 / DAY);
      expect(data.points[0][0].end).toBe(MARCH_1 / DAY + 2);
    });

    it('leaves a horizontal bar chart with no base a bar chart', () => {
      const gd = createGraphDiv({
        traces: [{ type: 'bar', orientation: 'h', x: [4, 6], y: ['Design', 'Build'] }],
        layout: timelineLayout(),
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
    });
  });

  describe('diverging bars', () => {
    function pyramidTraces(left: number[], right: number[]): PlotlyTrace[] {
      return [
        { type: 'bar', orientation: 'h', y: ['0-9', '10-19'], x: left, name: 'Male' },
        { type: 'bar', orientation: 'h', y: ['0-9', '10-19'], x: right, name: 'Female' },
      ];
    }

    function barLayer(traces: PlotlyTrace[], calcdata?: PlotlyCalcData[][]): MaidrLayer {
      const gd = createGraphDiv({
        traces,
        layout: {
          barmode: 'relative',
          xaxis: { domain: [0, 1], title: { text: 'Population' } },
          yaxis: { domain: [0, 1], title: { text: 'Age band' } },
        },
        calcdata,
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('reads two opposed sides as a pyramid, keeping the signs', () => {
      const layer = barLayer(pyramidTraces([-5, -7], [5, 6]));

      expect(layer.type).toBe(TraceType.DIVERGING);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      const data = layer.data as SegmentedPoint[][];
      // The sign is the side rather than a magnitude, and the trace reads it
      // as one — so it must survive into the payload.
      expect(data[0][0]).toEqual({ x: -5, y: '0-9', z: 'Male' });
      expect(data[1][1]).toEqual({ x: 6, y: '10-19', z: 'Female' });
      expect(layer.selectors).toBe('.subplot.xy .trace.bars .point > path');
    });

    it('keeps the sign of the size plotly computed for each bar', () => {
      // The calc sizes deliberately differ from the authored ones, so reading
      // `cd.s` — signed, not made absolute — is what this asserts.
      const layer = barLayer(pyramidTraces([-5, -7], [5, 6]), [
        [{ p: 0, s: -4 }, { p: 1, s: -8 }],
        [{ p: 0, s: 4.5 }, { p: 1, s: 6.5 }],
      ]);

      const data = layer.data as SegmentedPoint[][];
      expect(data[0][0]).toEqual({ x: -4, y: '0-9', z: 'Male' });
      expect(data[0][1]).toEqual({ x: -8, y: '10-19', z: 'Male' });
      expect(data[1][0]).toEqual({ x: 4.5, y: '0-9', z: 'Female' });
    });

    it('leaves a stack whose series grow the same way alone', () => {
      expect(barLayer(pyramidTraces([5, 7], [5, 6])).type).toBe(TraceType.STACKED);
    });

    it('leaves a series that crosses the baseline alone', () => {
      expect(barLayer(pyramidTraces([-5, 7], [5, 6])).type).toBe(TraceType.STACKED);
    });
  });

  describe('dot plots', () => {
    function dotLayer(overrides: Partial<PlotlyTrace> = {}): MaidrLayer {
      const gd = createGraphDiv({
        traces: [{
          type: 'scatter',
          mode: 'markers',
          uid: 'abc123',
          x: ['Chicago', 'Boston', 'Denver'],
          y: [21, 17, 24],
          name: 'Median rent',
          ...overrides,
        }],
        layout: {
          xaxis: { domain: [0, 1], title: { text: 'City' } },
          yaxis: { domain: [0, 1], title: { text: 'Rent' } },
        },
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('reads one marker per category as a dot plot', () => {
      const layer = dotLayer();

      expect(layer.type).toBe(TraceType.DOT);
      expect(layer.orientation).toBeUndefined();
      expect(layer.data as BarPoint[]).toEqual([
        { x: 'Chicago', y: 21 },
        { x: 'Boston', y: 17 },
        { x: 'Denver', y: 24 },
      ]);
    });

    it('reads the categories off whichever axis carries them', () => {
      const layer = dotLayer({ x: [21, 17], y: ['Chicago', 'Boston'] });

      expect(layer.type).toBe(TraceType.DOT);
      expect(layer.orientation).toBe(Orientation.HORIZONTAL);
      expect(layer.data as BarPoint[]).toEqual([
        { x: 21, y: 'Chicago' },
        { x: 17, y: 'Boston' },
      ]);
    });

    it('scopes the highlight to the trace\'s own markers', () => {
      // The subplot prefix alone would take in every scatter on the panel,
      // and a bar-shaped layer pairs its selector with its own points.
      expect(dotLayer().selectors)
        .toBe('.subplot.xy .scatterlayer g.trace.traceabc123 .point');
    });

    it('leaves a scatter that draws a category twice alone', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'scatter',
          mode: 'markers',
          uid: 'abc123',
          x: ['Chicago', 'Chicago', 'Boston'],
          y: [21, 19, 17],
        }],
        layout: { xaxis: { domain: [0, 1] }, yaxis: { domain: [0, 1] } },
      });

      // Still a scatter — and a scatter of labels has no numeric coordinates
      // to emit, which is what it already did before dot plots were read.
      expect(extractPlotlyData(gd)).toBeNull();
    });
  });

  describe('word clouds', () => {
    function cloudLayer(overrides: Partial<PlotlyTrace> = {}): MaidrLayer {
      const gd = createGraphDiv({
        traces: [{
          type: 'scatter',
          mode: 'text',
          uid: 'wc1',
          x: [3, 1, 2],
          y: [2, 1, 3],
          text: ['sonification', 'braille', 'audio'],
          textfont: { size: [44, 18, 30] },
          name: 'Terms',
          ...overrides,
        }],
        layout: { xaxis: { domain: [0, 1] }, yaxis: { domain: [0, 1] } },
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('reads a text scatter with per-term glyph sizes as a cloud', () => {
      const layer = cloudLayer();

      expect(layer.type).toBe(TraceType.WORD_CLOUD);
      expect(layer.data).toEqual([
        { x: 'sonification', y: 44 },
        { x: 'braille', y: 18 },
        { x: 'audio', y: 30 },
      ]);
      expect(layer.axes?.x?.label).toBe('Term');
      expect(layer.axes?.y?.label).toBe('Weight');
    });

    it('prefers a weight the author carried over the glyph size', () => {
      const layer = cloudLayer({ customdata: [1200, 300, 640] });

      expect((layer.data as { y: number }[]).map(point => point.y))
        .toEqual([1200, 300, 640]);
    });

    it('highlights the glyph, which is the only mark the cloud draws', () => {
      expect(cloudLayer().selectors)
        .toBe('.subplot.xy .scatterlayer g.trace.tracewc1 g.textpoint > text');
    });

    it('leaves a text scatter with one glyph size a scatter', () => {
      const gd = createGraphDiv({
        traces: [{
          type: 'scatter',
          mode: 'markers+text',
          uid: 'wc1',
          x: [1, 2],
          y: [3, 4],
          text: ['a', 'b'],
          textfont: { size: 12 },
        }],
        layout: { xaxis: { domain: [0, 1] }, yaxis: { domain: [0, 1] } },
      });

      expect(extractPlotlyData(gd)!.subplots[0][0].layers[0].type)
        .toBe(TraceType.SCATTER);
    });
  });

  describe('choropleth traces', () => {
    function choroplethTrace(overrides: Partial<PlotlyTrace> = {}): PlotlyTrace {
      return {
        type: 'choropleth',
        locations: ['FRA', 'DEU', 'ITA'],
        z: [10, 20, 30],
        text: ['France', 'Germany', 'Italy'],
        colorbar: { title: { text: 'GDP' } },
        name: 'Europe',
        ...overrides,
      };
    }

    /** What plotly leaves once the map has been projected. */
    function choroplethCalc(): PlotlyCalcData[] {
      return [
        { loc: 'FRA', z: 10, ct: [2.2, 46.2] },
        { loc: 'DEU', z: 20, ct: [10.4, 51.1] },
        { loc: 'ITA', z: 30, ct: [12.6, 42.8] },
      ];
    }

    function choroplethLayer(
      trace: PlotlyTrace = choroplethTrace(),
      calcdata: PlotlyCalcData[] = choroplethCalc(),
    ): MaidrLayer {
      const gd = createGraphDiv({
        traces: [trace],
        layout: { geo: { domain: { x: [0, 1], y: [0, 1] } } },
        calcdata: [calcdata],
      });
      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();
      return maidr!.subplots[0][0].layers[0];
    }

    it('reads the regions with the centroids plotly resolved for them', () => {
      const layer = choroplethLayer();

      expect(layer.type).toBe(TraceType.CHOROPLETH);
      expect(layer.data as ChoroplethPoint[]).toEqual([
        { x: 'France', y: 10, lon: 2.2, lat: 46.2 },
        { x: 'Germany', y: 20, lon: 10.4, lat: 51.1 },
        { x: 'Italy', y: 30, lon: 12.6, lat: 42.8 },
      ]);
      // The colorbar is the only place a choropleth names its magnitude.
      expect(layer.axes?.y?.label).toBe('GDP');
      expect(layer.axes?.x?.label).toBe('Region');
    });

    it('falls back to the location code when nothing names the region', () => {
      const layer = choroplethLayer(choroplethTrace({ text: undefined }));

      expect((layer.data as ChoroplethPoint[]).map(point => point.x))
        .toEqual(['FRA', 'DEU', 'ITA']);
    });

    it('leaves the centroid off a map plotly has not projected', () => {
      const layer = choroplethLayer(choroplethTrace(), []);

      expect(layer.data as ChoroplethPoint[]).toEqual([
        { x: 'France', y: 10 },
        { x: 'Germany', y: 20 },
        { x: 'Italy', y: 30 },
      ]);
    });

    it('drops a region plotly could not shade, keeping the others\' shapes', () => {
      const layer = choroplethLayer(choroplethTrace(), [
        { loc: 'FRA', z: 10, ct: [2.2, 46.2] },
        { loc: null, z: undefined },
        { loc: 'ITA', z: 30, ct: [12.6, 42.8] },
      ]);

      expect((layer.data as ChoroplethPoint[]).map(point => point.x))
        .toEqual(['France', 'Italy']);
      // The dropped region keeps its own path in the DOM, so the ones after it
      // are still addressed by their own position.
      expect(layer.selectors).toEqual([
        '.geolayer > g.geo.geo > g.backplot > g.choroplethlayer > g.trace.choropleth:nth-of-type(1) > path.choroplethlocation:nth-of-type(1)',
        '.geolayer > g.geo.geo > g.backplot > g.choroplethlayer > g.trace.choropleth:nth-of-type(1) > path.choroplethlocation:nth-of-type(3)',
      ]);
    });

    it('keeps a geo subplot apart from the cartesian panel beside it', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'Counts' },
          choroplethTrace({ geo: 'geo2' }),
        ],
        layout: {
          xaxis: { domain: [0, 0.45] },
          yaxis: { domain: [0, 1] },
          geo2: { domain: { x: [0.55, 1], y: [0, 1] } },
        },
        calcdata: [[], choroplethCalc()],
      });

      const maidr = extractPlotlyData(gd);

      expect(maidr!.subplots[0]).toHaveLength(2);
      expect(maidr!.subplots[0].map(panel => panel.layers[0].type))
        .toEqual([TraceType.BAR, TraceType.CHOROPLETH]);
      expect(maidr!.subplots[0][1].layers[0].selectors)
        .toEqual(expect.arrayContaining([expect.stringContaining('g.geo.geo2')]));
    });
  });
});
