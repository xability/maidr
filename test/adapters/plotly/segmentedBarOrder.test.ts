/**
 * @jest-environment jsdom
 */

/**
 * A dodged or stacked plotly bar layer has to be emitted in the order plotly
 * draws it (#989).
 *
 * The half of #987 that #988 left out. `categoryorder` sorts the category axis
 * and leaves every trace's own `x` and `y` alone, so each series arrives in an
 * order the chart does not show — and a segmented layer is read *by column*,
 * so a wrong column order is wrong for the arrowing, the pan, the braille
 * line, the autoplay sweep, and the summary row all at once.
 *
 * Measured on plotly.js in Chromium for two traces over
 * `x: ['charlie','alpha','bravo']` with `categoryorder: 'category ascending'`:
 *
 *   barmode   groups in DOM   calcdata p per trace   group 0 heights in DOM
 *   group     2               [2,0,1], [2,0,1]       30, 10, 20
 *   stack     2               [2,0,1], [2,0,1]       28,  9, 18
 *
 * `p` is the resolved position while each group's DOM order is still the order
 * its `y` was written in, exactly as for a plain bar. What differs is the
 * selector: #988's narrowing assumes one `.trace.bars` group, and a segmented
 * layer has one per trace, so the group has to be pinned before the bar is.
 * Measured feasible, one element each:
 *
 *   .barlayer > g.trace.bars:nth-of-type(1) > g.points > g.point:nth-of-type(2) > path
 *
 * Two further measurements shape the code below. Plotly draws a `.point` per
 * datum whether it is zero, null or measured, so the per-bar count is 1:1 with
 * the trace's own array. And a `histogram` sharing the panel gets a group in
 * the same `.barlayer`, in `_fullData` order — so the group index counts
 * histograms too, which is what `barLayerPosition` already does.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer, SegmentedPoint } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An axis drawn from its low end: left to right on x, bottom up on y. */
const FORWARD = [-0.5, 2.5];
/** A reversed axis, which plotly resolves to a high-to-low range. */
const BACKWARD = [2.5, -0.5];

/** Categories in the order the traces name them. */
const X = ['charlie', 'alpha', 'bravo'];
/** The two series' values, in that same order. */
const SERIES = [[3, 1, 2], [30, 10, 20]];

/** The positions plotly resolves when nothing sorts the axis. */
const UNSORTED = [0, 1, 2];
/** What `categoryorder: 'category ascending'` resolves to, measured. */
const SORTED = [2, 0, 1];

interface Options {
  /** Each series' resolved axis positions, or undefined where plotly has none. */
  positions: (number | undefined)[][];
  /** The category axis's resolved range. */
  range?: number[];
  /** How plotly combines the traces. */
  barmode?: string;
  /** Whether the bars grow sideways. */
  horizontal?: boolean;
  /** A histogram drawn into the same layer, before the bars. */
  histogram?: boolean;
  /** Whether the first bar trace declares the panel a marimekko. */
  mosaic?: boolean;
}

/**
 * A rendered plotly div holding two bar traces.
 * @param options - What the chart is
 * @returns The graph div
 */
function graphDiv(options: Options): PlotlyGraphDiv {
  const { positions, range = FORWARD, barmode = 'stack', horizontal = false } = options;

  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const bars = positions.map((_, series) => ({
    type: 'bar',
    name: `S${series}`,
    ...(horizontal
      ? { y: X, x: SERIES[series], orientation: 'h' }
      : { x: X, y: SERIES[series] }),
    ...(options.mosaic && series === 0
      ? { width: [30, 90, 60], meta: { maidr: { type: 'mosaic' } } }
      : {}),
  }) as unknown as PlotlyTrace);
  const histogram = { type: 'histogram', name: 'H', x: X } as unknown as PlotlyTrace;

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = options.histogram
    ? [histogram, ...bars]
    : bars;
  const category = { type: 'category', range };
  const measure = { type: 'linear', range: [0, 40] };
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    barmode,
    xaxis: horizontal ? measure : category,
    yaxis: horizontal ? category : measure,
  };

  const calc = positions.map((series, index) =>
    series.map((at, point) => ({ p: at, s: SERIES[index][point] }) as PlotlyCalcData));
  (gd as unknown as { calcdata: PlotlyCalcData[][] }).calcdata = options.histogram
    ? [UNSORTED.map(at => ({ p: at, s: 1 }) as PlotlyCalcData), ...calc]
    : calc;
  return gd;
}

/**
 * The segmented layer a chart converts to.
 * @param options - What the chart is
 * @returns The emitted layer
 */
function layerFor(options: Options): MaidrLayer {
  const layers = extractPlotlyData(graphDiv(options))?.subplots[0][0].layers ?? [];
  const layer = layers.find(candidate =>
    candidate.type === TraceType.STACKED
    || candidate.type === TraceType.DODGED
    || candidate.type === TraceType.MOSAIC);
  if (!layer)
    throw new Error('no segmented layer emitted');
  return layer;
}

/** The category names a layer announces, one row per series. */
function announced(layer: MaidrLayer): unknown[][] {
  return (layer.data as SegmentedPoint[][]).map(series =>
    series.map(point => point.x));
}

/** The magnitudes a layer announces, one row per series. */
function magnitudes(layer: MaidrLayer): unknown[][] {
  return (layer.data as SegmentedPoint[][]).map(series =>
    series.map(point => point.y));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a segmented bar chart plotly draws in the traces\' own order', () => {
  it('announces every series as its trace names it', () => {
    expect(announced(layerFor({ positions: [UNSORTED, UNSORTED] })))
      .toEqual([X, X]);
  });

  it('keeps the one selector the whole layer shares', () => {
    // Nothing has moved, so there is no reason to take on the brittleness of
    // counting groups and points. The overwhelmingly common chart is left
    // exactly as it was.
    expect(typeof layerFor({ positions: [UNSORTED, UNSORTED] }).selectors)
      .toBe('string');
  });
});

describe('a segmented bar chart whose categories plotly re-sorts', () => {
  const sorted = { positions: [SORTED, SORTED] };

  it('announces every series left to right as drawn', () => {
    expect(announced(layerFor(sorted)))
      .toEqual([['alpha', 'bravo', 'charlie'], ['alpha', 'bravo', 'charlie']]);
  });

  it('carries each value with its own category', () => {
    expect(magnitudes(layerFor(sorted))).toEqual([[1, 2, 3], [10, 20, 30]]);
  });

  it('leaves the columns aligned, which is how the layer is read', () => {
    // Every series' column `c` has to name one category: it is what the
    // arrowing crosses, and what the summary row sums down.
    const [first, second] = announced(layerFor(sorted));

    expect(first).toEqual(second);
  });

  it('names one element per cell rather than one per layer', () => {
    const { selectors } = layerFor(sorted);

    expect(Array.isArray(selectors)).toBe(true);
    expect((selectors as string[][]).map(row => row.length)).toEqual([3, 3]);
  });

  it('scopes each row to its own trace group', () => {
    // #988's narrowing counted `.point` alone, which names the nth bar of
    // *every* group — measured as 2 elements on a two-trace panel.
    const selectors = layerFor(sorted).selectors as string[][];

    expect(selectors[0].every(one => one.includes('bars:nth-of-type(1)'))).toBe(true);
    expect(selectors[1].every(one => one.includes('bars:nth-of-type(2)'))).toBe(true);
  });

  it('points each cell at the bar its own point announces', () => {
    // The DOM order within a group is the trace's, so the cell announced
    // first — 'alpha', which the trace names second — is that group's second
    // `.point`.
    const selectors = layerFor(sorted).selectors as string[][];

    expect(selectors[0][0]).toContain('point:nth-of-type(2)');
    expect(selectors[0][1]).toContain('point:nth-of-type(3)');
    expect(selectors[0][2]).toContain('point:nth-of-type(1)');
  });

  it('keeps the subplot scope and the path tail', () => {
    const selectors = layerFor(sorted).selectors as string[][];

    expect(selectors[0][0].startsWith('.subplot.xy .barlayer >')).toBe(true);
    expect(selectors[0][0].endsWith('> path')).toBe(true);
  });

  it('does the same for a dodged chart', () => {
    // Same renderer, same calcdata, same DOM shape — measured together.
    const layer = layerFor({ positions: [SORTED, SORTED], barmode: 'group' });

    expect(layer.type).toBe(TraceType.DODGED);
    expect(announced(layer)[0]).toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('a histogram sharing the panel', () => {
  it('shifts the groups the bars are counted into', () => {
    // Plotly draws a histogram through the bar renderer and into the same
    // `.barlayer`, in `_fullData` order. Counted as if it were not there, the
    // first series would outline the histogram's bins.
    const selectors = layerFor({ positions: [SORTED, SORTED], histogram: true })
      .selectors as string[][];

    expect(selectors[0].every(one => one.includes('bars:nth-of-type(2)'))).toBe(true);
    expect(selectors[1].every(one => one.includes('bars:nth-of-type(3)'))).toBe(true);
  });
});

describe('a reversed category axis', () => {
  it('draws the bars from the other end, so they come back reversed', () => {
    expect(announced(layerFor({ positions: [UNSORTED, UNSORTED], range: BACKWARD }))[0])
      .toEqual(['bravo', 'alpha', 'charlie']);
  });

  it('composes with a sort rather than replacing it', () => {
    expect(announced(layerFor({ positions: [SORTED, SORTED], range: BACKWARD }))[0])
      .toEqual(['charlie', 'bravo', 'alpha']);
  });

  it('moves the selectors with them', () => {
    const selectors = layerFor({ positions: [UNSORTED, UNSORTED], range: BACKWARD })
      .selectors as string[][];

    expect(selectors[0][0]).toContain('point:nth-of-type(3)');
    expect(selectors[0][2]).toContain('point:nth-of-type(1)');
  });
});

describe('a horizontal segmented chart', () => {
  it('reads its categories off the axis they are on', () => {
    // The categories are on y when the bars grow sideways, so that is the
    // axis whose direction decides the order.
    const layer = layerFor({ positions: [SORTED, SORTED], horizontal: true });

    expect((layer.data as SegmentedPoint[][])[0].map(point => point.y))
      .toEqual(['alpha', 'bravo', 'charlie']);
  });
});

describe('an order that cannot be resolved', () => {
  it('leaves a trace plotly has not calculated alone', () => {
    const layer = layerFor({ positions: [[undefined, undefined, undefined], SORTED] });

    expect(announced(layer)).toEqual([X, X]);
    expect(typeof layer.selectors).toBe('string');
  });

  it('leaves one alone when a single position is missing', () => {
    // A partial answer is not a safer answer: the bar with no position would
    // have to be put somewhere, and any choice would be a guess.
    const layer = layerFor({ positions: [[2, undefined, 1], SORTED] });

    expect(announced(layer)).toEqual([X, X]);
    expect(typeof layer.selectors).toBe('string');
  });

  it('leaves a panel whose series cover different categories alone', () => {
    // Sorting each series by its own positions would put a different category
    // in column 1 of each, and the layer announces a column as one category.
    // Such a panel is already misaligned; choosing an order for it would be
    // inventing an answer rather than reading one.
    const layer = layerFor({ positions: [[2, 0, 1], [2, 0, 3]] });

    expect(announced(layer)).toEqual([X, X]);
    expect(typeof layer.selectors).toBe('string');
  });

  it('leaves a declared marimekko alone', () => {
    // Plotly draws a marimekko's columns at precomputed cumulative positions
    // rather than at categories, so what `p` means there has not been measured
    // the way it has for a bar — and a `categoryorder` cannot reach a numeric
    // axis in any case.
    const layer = layerFor({ positions: [SORTED, SORTED], mosaic: true });

    expect(layer.type).toBe(TraceType.MOSAIC);
    expect(typeof layer.selectors).toBe('string');
  });

  it('leaves a series holding two bars at one position alone', () => {
    // The sort is free to put either first, and that choice would decide
    // which bar the column announces.
    const layer = layerFor({ positions: [[1, 1, 0], [1, 1, 0]] });

    expect(announced(layer)).toEqual([X, X]);
    expect(typeof layer.selectors).toBe('string');
  });
});
