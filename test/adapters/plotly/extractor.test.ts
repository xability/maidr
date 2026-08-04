import type { PlotlyCalcData, PlotlyFullLayout, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { BarPoint, SegmentedPoint } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { normalizePlotlySvg } from '@adapters/plotly/normalizer';
import { describe, expect, it } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
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

  describe('core-model integration', () => {
    /**
     * The model and normalizer resolve elements via page globals; point
     * them at the graph div's JSDOM window for the duration of `fn`.
     */
    function withDomGlobals(gd: PlotlyGraphDiv, fn: (doc: Document) => void): void {
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
        fn(doc);
      } finally {
        for (const key of Object.keys(saved) as (keyof typeof saved)[]) {
          if (saved[key] === undefined) {
            delete testGlobals[key];
          } else {
            (testGlobals as Record<string, unknown>)[key] = saved[key];
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
});
