import type { PlotlyFullLayout, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { normalizePlotlySvg } from '@adapters/plotly/normalizer';
import { describe, expect, it } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface GraphDivOptions {
  id?: string;
  traces: PlotlyTrace[];
  layout: PlotlyFullLayout;
  /** Panel background rect positions rendered into the `.bglayer`. */
  bgRects?: { x: number; y: number }[];
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

    it('emits per-panel g[id="axes_…"] selectors prefixed with the chart id', () => {
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
        'g[id="axes_my-chart_1"]',
        'g[id="axes_my-chart_2"]',
        'g[id="axes_my-chart_3"]',
        'g[id="axes_my-chart_4"]',
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

    it('omits ALL subplot selectors when a dropped panel breaks rect alignment', () => {
      // Panel x5y5 holds only an unsupported trace type, so it is dropped
      // from the schema — but its background rect is still rendered. The
      // positional rect↔panel match would shift, so no selector is safe.
      const gd = createGraphDiv({
        traces: [
          scatterTrace({ name: 'A' }),
          scatterTrace({ name: 'B', xaxis: 'x2', yaxis: 'y2' }),
          scatterTrace({ name: 'C', xaxis: 'x3', yaxis: 'y3' }),
          scatterTrace({ name: 'D', xaxis: 'x4', yaxis: 'y4' }),
          { type: 'violin', y: [1, 2, 3], xaxis: 'x5', yaxis: 'y5' },
        ],
        layout: twoByTwoLayout({
          xaxis5: { domain: [0, 0.45] },
          yaxis5: { domain: [0, 0.425] },
        }),
        bgRects: [...TWO_BY_TWO_RECTS, { x: 800, y: 300 }],
      });

      const maidr = extractPlotlyData(gd);

      const selectors = maidr!.subplots.flat().map(subplot => subplot.selector);
      expect(selectors.every(selector => selector === undefined)).toBe(true);
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

  describe('core-model integration', () => {
    it('the emitted multi-panel Maidr constructs a navigable Figure', () => {
      const gd = createGraphDiv({
        traces: [
          { type: 'bar', x: ['a', 'b'], y: [1, 2], name: 'A' },
          { type: 'bar', x: ['a', 'b'], y: [3, 4], name: 'B', xaxis: 'x2', yaxis: 'y2' },
          { type: 'bar', x: ['a', 'b'], y: [5, 6], name: 'C', xaxis: 'x3', yaxis: 'y3' },
          { type: 'bar', x: ['a', 'b'], y: [7, 8], name: 'D', xaxis: 'x4', yaxis: 'y4' },
        ],
        layout: twoByTwoLayout(),
        bgRects: TWO_BY_TWO_RECTS,
      });

      const maidr = extractPlotlyData(gd);
      expect(maidr).not.toBeNull();

      // The model and normalizer resolve elements via page globals; point
      // them at this test's JSDOM window for the duration of the assertion.
      const doc = gd.ownerDocument;
      const win = doc.defaultView!;
      const testGlobals = globalThis as {
        document?: Document;
        MutationObserver?: typeof MutationObserver;
        requestAnimationFrame?: (callback: FrameRequestCallback) => number;
      };
      const saved = {
        document: testGlobals.document,
        MutationObserver: testGlobals.MutationObserver,
        requestAnimationFrame: testGlobals.requestAnimationFrame,
      };
      testGlobals.document = doc;
      testGlobals.MutationObserver = win.MutationObserver;
      testGlobals.requestAnimationFrame = () => 0;
      try {
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
      } finally {
        for (const key of Object.keys(saved) as (keyof typeof saved)[]) {
          if (saved[key] === undefined) {
            delete testGlobals[key];
          } else {
            (testGlobals as Record<string, unknown>)[key] = saved[key];
          }
        }
      }
    });
  });
});
