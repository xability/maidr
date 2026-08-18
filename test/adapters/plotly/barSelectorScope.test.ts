/**
 * @jest-environment jsdom
 */

/**
 * A bar layer's selector has to name its own trace's bars and no others
 * (#993).
 *
 * Every bar-family layer shared one panel-wide selector,
 * `.subplot.xy .trace.bars .point > path`. That is right when the panel draws
 * one trace into its `barlayer` — the overwhelmingly common chart — and wrong
 * whenever it draws more and MAIDR emits a layer per trace.
 *
 * Measured on plotly.js in Chromium, counting what the panel-wide selector
 * resolves to:
 *
 *   panel                          barlayer groups   points each   matches
 *   one bar alone                  1                 [3]           3   <- fine
 *   one bar + one histogram        2                 [3, 2]        5
 *   two bars, barmode overlay      2                 [3, 3]        6
 *   two histograms                 2                 [2, 2]        4
 *
 * The two failures that produces are not the same size. A plain layer sees
 * more elements than points, so `AbstractBarPlot` discards its clones and
 * reports no highlight — driven through `TraceFactory.create`, a three-point
 * bar layer on a two-group DOM came back `null`. A *segmented* layer chunks
 * the list instead, and a histogram sitting first in the `barlayer` shifts
 * every cell:
 *
 *   highlight  [["H-bin1", "H-bin2", "A-charlie"], ["A-alpha", "A-bravo", "B-charlie"]]
 *
 * — announcing series A at 'charlie' while outlining the histogram's first
 * bin. Not a missing highlight but a wrong one.
 *
 * Both are fixed by scoping to the group, which is measured to resolve to
 * exactly that trace's bars. A segmented layer spans several traces, so it
 * takes a list over the groups it covers; `querySelectorAll` answers a
 * selector list in document order, which across those groups is the
 * series-major order the chunking expects.
 */

import type { PlotlyCalcData, PlotlyGraphDiv, PlotlyTrace } from '@adapters/plotly/types';
import type { MaidrLayer } from '@type/grammar';
import { extractPlotlyData } from '@adapters/plotly/extractor';
import { afterEach, describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';

const SVG_NS = 'http://www.w3.org/2000/svg';

const X = ['charlie', 'alpha', 'bravo'];

/** The selector naming one whole group of a layer, counting from one. */
function group(position: number, layer = 'barlayer'): string {
  return `.subplot.xy .${layer} > g.trace.bars:nth-of-type(${position}) .point > path`;
}

/**
 * A rendered plotly div holding the named traces.
 * @param traces    - The traces, already resolved
 * @param barmode   - How plotly combines them
 * @param positions - Each point's resolved axis position, when not the trace's
 * @returns The graph div
 */
function graphDiv(
  traces: PlotlyTrace[],
  barmode = 'group',
  positions?: number[],
): PlotlyGraphDiv {
  const div = document.createElement('div');
  div.id = 'chart';
  div.className = 'js-plotly-plot';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'main-svg');
  div.appendChild(svg);
  document.body.appendChild(div);

  const gd = div as PlotlyGraphDiv;
  (gd as unknown as { _fullData: unknown })._fullData = traces;
  (gd as unknown as { _fullLayout: unknown })._fullLayout = {
    barmode,
    xaxis: { type: 'category', range: [-0.5, 2.5] },
    yaxis: { type: 'linear', range: [0, 40] },
  };
  // Positions already in the drawn order unless a caller says otherwise, so
  // the selector shape is what is under test rather than #989's permutation.
  (gd as unknown as { calcdata: PlotlyCalcData[][] }).calcdata = traces.map(trace =>
    ((trace.x ?? []) as unknown[]).map((_, index) =>
      ({ p: positions?.[index] ?? index, s: 1 }) as PlotlyCalcData));
  return gd;
}

/** A bar trace over the shared categories. */
function bar(name: string, values: number[]): PlotlyTrace {
  return { type: 'bar', name, x: X, y: values } as unknown as PlotlyTrace;
}

/** A histogram, which plotly draws into the same layer. */
function histogram(name: string): PlotlyTrace {
  return { type: 'histogram', name, x: ['alpha', 'alpha'] } as unknown as PlotlyTrace;
}

/** A funnel, which plotly draws into a layer of its own. */
function funnel(name: string, values: number[]): PlotlyTrace {
  return { type: 'funnel', name, x: X, y: values } as unknown as PlotlyTrace;
}

/** A waterfall, likewise. */
function waterfall(name: string, values: number[]): PlotlyTrace {
  return { type: 'waterfall', name, x: X, y: values } as unknown as PlotlyTrace;
}

/**
 * The layers a chart converts to.
 * @param traces    - The traces
 * @param barmode   - How plotly combines them
 * @param positions - Each point's resolved axis position, when not the trace's
 * @returns The emitted layers
 */
function layersFor(
  traces: PlotlyTrace[],
  barmode?: string,
  positions?: number[],
): MaidrLayer[] {
  return extractPlotlyData(graphDiv(traces, barmode, positions))
    ?.subplots[0][0]
    .layers ?? [];
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a panel drawing one bar trace', () => {
  it('names that trace\'s group', () => {
    // Scoped even here: a one-group panel resolves the same either way, and a
    // selector right only in the common case is the shape of this bug.
    expect(layersFor([bar('A', [3, 1, 2])])[0].selectors).toBe(group(1));
  });
});

describe('a panel drawing a bar beside a histogram', () => {
  const layers = (): MaidrLayer[] => layersFor([bar('A', [3, 1, 2]), histogram('H')]);

  it('gives the bar its own group', () => {
    const layer = layers().find(one => one.type === TraceType.BAR);

    expect(layer?.selectors).toBe(group(1));
  });

  it('gives the histogram its own group', () => {
    const layer = layers().find(one => one.type === TraceType.HISTOGRAM);

    expect(layer?.selectors).toBe(group(2));
  });

  it('counts the histogram when it is declared first', () => {
    // Plotly draws the groups in `_fullData` order, so a histogram before the
    // bars takes group 1 and shifts them.
    const emitted = layersFor([histogram('H'), bar('A', [3, 1, 2])]);

    expect(emitted.find(one => one.type === TraceType.HISTOGRAM)?.selectors).toBe(group(1));
    expect(emitted.find(one => one.type === TraceType.BAR)?.selectors).toBe(group(2));
  });
});

describe('a panel drawing two bars in overlay mode', () => {
  it('gives each layer only its own bars', () => {
    // `barmode: 'overlay'` emits a layer per trace rather than combining them,
    // which is how two BAR layers come to share a panel at all.
    const emitted = layersFor([bar('A', [3, 1, 2]), bar('B', [30, 10, 20])], 'overlay');

    expect(emitted.map(one => one.selectors)).toEqual([group(1), group(2)]);
  });
});

describe('a segmented layer', () => {
  it('lists the groups it covers, one per series', () => {
    const layer = layersFor([bar('A', [3, 1, 2]), bar('B', [30, 10, 20])], 'stack')[0];

    expect(layer.selectors).toBe(`${group(1)}, ${group(2)}`);
  });

  it('leaves out a histogram it does not cover', () => {
    // The failure worth the most here: chunked, the histogram's bins sat at
    // the head of the list and every cell of every series shifted by two.
    const emitted = layersFor(
      [histogram('H'), bar('A', [3, 1, 2]), bar('B', [30, 10, 20])],
      'stack',
    );
    const layer = emitted.find(one => one.type === TraceType.STACKED);

    expect(layer?.selectors).toBe(`${group(2)}, ${group(3)}`);
  });

  it('keeps the series in the order the groups are drawn', () => {
    // `querySelectorAll` answers a selector list in document order, so the
    // list has to run in group order for the chunking to land series 0 on the
    // first group. Written in the other order it would still resolve — to the
    // same elements, in the same order — and quietly mean something else.
    const layer = layersFor([bar('A', [3, 1, 2]), bar('B', [30, 10, 20])], 'stack')[0];
    const listed = (layer.selectors as string).split(', ');

    expect(listed[0]).toContain('nth-of-type(1)');
    expect(listed[1]).toContain('nth-of-type(2)');
  });
});

describe('the layers beside `barlayer`', () => {
  it('gives each funnel its own group', () => {
    // Measured: two funnels on a panel get two groups in `.funnellayer`, and
    // the layer-wide selector matched all six of their bars.
    const emitted = layersFor([funnel('F1', [5, 4, 3]), funnel('F2', [9, 8, 7])]);

    expect(emitted.map(one => one.selectors))
      .toEqual([group(1, 'funnellayer'), group(2, 'funnellayer')]);
  });

  it('gives each waterfall its own group', () => {
    const emitted = layersFor([waterfall('W1', [5, -2, 3]), waterfall('W2', [9, -4, 6])]);

    expect(emitted.map(one => one.selectors))
      .toEqual([group(1, 'waterfalllayer'), group(2, 'waterfalllayer')]);
  });

  it('counts each layer separately', () => {
    // Measured on one panel carrying all four types: no type strays into
    // another's layer, so a bar sitting before a funnel does not shift it.
    const emitted = layersFor([bar('A', [3, 1, 2]), funnel('F', [5, 4, 3])]);

    expect(emitted.find(one => one.type === TraceType.BAR)?.selectors).toBe(group(1));
    expect(emitted.find(one => one.type === TraceType.FUNNEL)?.selectors)
      .toBe(group(1, 'funnellayer'));
  });
});

describe('a reordered bar layer on a panel with two groups', () => {
  it('narrows within its own group rather than across both', () => {
    // Where #988 and this meet. `categoryorder` moves the bars, so the layer's
    // selector is narrowed per bar — and the head it narrows is now the scoped
    // one, so `nth-child` counts inside that trace's group. Narrowed from the
    // panel-wide head instead, each of these would have named the nth bar of
    // *both* groups.
    const emitted = layersFor(
      [bar('A', [3, 1, 2]), bar('B', [30, 10, 20])],
      'overlay',
      // 'category ascending' over ['charlie','alpha','bravo'], measured.
      [2, 0, 1],
    );
    const selectors = emitted[1].selectors as string[];

    expect(selectors).toHaveLength(3);
    expect(selectors.every(one =>
      one.startsWith('.subplot.xy .barlayer > g.trace.bars:nth-of-type(2) '))).toBe(true);
    expect(selectors[0]).toContain('.point:nth-child(2) > path');
  });
});
