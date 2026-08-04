import type { MaidrLayer } from '@type/grammar';
import type { BarBrailleState, TraceState } from '@type/state';
import { afterEach, describe, expect, it } from '@jest/globals';
import { BarTrace } from '@model/bar';
import { SegmentedTrace } from '@model/segmented';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';

/**
 * Builds a single-series bar layer. A gap is passed as `null`, which is how a
 * chart library reports a missing bar and what the plotly adapter carries
 * through; the grammar types the field as `number | string`, hence the cast.
 */
function barLayer(values: (number | null)[]): MaidrLayer {
  return {
    id: 'bars',
    type: TraceType.BAR,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: values.map((y, index) => ({ x: `Q${index + 1}`, y: y as number })),
  };
}

/** Narrows the trace state union to the populated case. */
function stateOf(trace: BarTrace | SegmentedTrace): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty || state.type !== 'trace') {
    throw new Error('expected a populated trace state');
  }
  return state;
}

describe('bar plot gaps', () => {
  it('keeps a gap out of the row range so it cannot drag the minimum down', () => {
    const trace = new BarTrace(barLayer([120, null, 40]));

    const { audio } = stateOf(trace);

    // Without this, Number(null) puts a 0 in the row and the range becomes
    // 0..120 — every other bar's pitch is scaled against a bar that is not
    // on the chart.
    expect(audio.freq.min).toBe(40);
    expect(audio.freq.max).toBe(120);
  });

  it('reports a gap as having no magnitude rather than as a zero', () => {
    const trace = new BarTrace(barLayer([120, null, 40]));

    trace.moveToIndex(0, 1);
    const { audio, text } = stateOf(trace);

    // A non-finite raw is what tells AudioService to sound the empty tone
    // instead of interpolating a frequency.
    expect(Number.isFinite(audio.freq.raw as number)).toBe(false);
    // The text layer keeps saying "missing", which it derives from the raw
    // point rather than from barValues.
    expect(text.cross?.value).toBeNull();
  });

  it('still treats a bar genuinely measured at zero as a real value', () => {
    const trace = new BarTrace(barLayer([0, 80, 40]));

    const { audio } = stateOf(trace);

    expect(audio.freq.min).toBe(0);
    expect(Number.isFinite(audio.freq.raw as number)).toBe(true);
  });

  it('leaves a row of real values completely unchanged', () => {
    const trace = new BarTrace(barLayer([120, 80, 40]));

    const { audio, braille } = stateOf(trace);

    expect(audio.freq.min).toBe(40);
    expect(audio.freq.max).toBe(120);
    expect((braille as BarBrailleState).values).toEqual([[120, 80, 40]]);
  });

  it('reaches the true extreme rather than the gap when navigating to the minimum', () => {
    const trace = new BarTrace(barLayer([120, null, 40]));

    const targets = trace.getExtremaTargets();

    const min = targets.find(target => target.label.toLowerCase().includes('min'));
    expect(min?.value).toBe(40);
  });

  it('treats a blank cell as a gap, since Number("") is also 0', () => {
    const trace = new BarTrace(barLayer([120, '' as unknown as number, 40]));

    const { audio } = stateOf(trace);

    expect(audio.freq.min).toBe(40);
    expect(audio.freq.max).toBe(120);
  });

  it('describes a chart of nothing but gaps as missing, not as an infinity', () => {
    // safeMin/safeMax answer an empty set with ±Infinity, which is not
    // something to read out as a chart's minimum.
    const trace = new BarTrace(barLayer([null, null]));

    const stats = trace.description.stats;

    expect(stats.find(stat => stat.label === 'Min value')?.value).toBe('missing');
    expect(stats.find(stat => stat.label === 'Max value')?.value).toBe('missing');
  });

  it('offers no extreme for a row that is entirely gaps', () => {
    // The range is empty, so safeMin/safeMax return ±Infinity, which indexOf
    // cannot find — the target would have carried pointIndex -1 and moved the
    // cursor off the row.
    const trace = new BarTrace(barLayer([null, null]));

    expect(trace.getExtremaTargets()).toEqual([]);
  });
});

/**
 * Builds a two-series stacked layer. `SegmentedTrace` appends a Total row
 * summing the series, which is where a gap has the furthest to spread.
 */
function stackedLayer(east: (number | null)[], west: (number | null)[]): MaidrLayer {
  const series = (values: (number | null)[], name: string): { x: string; y: number; z: string }[] =>
    values.map((y, index) => ({ x: `Q${index + 1}`, y: y as number, z: name }));

  return {
    id: 'stack',
    type: TraceType.STACKED,
    axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    data: [series(east, 'East'), series(west, 'West')],
  };
}

describe('segmented bar gap DOM alignment', () => {
  /**
   * Provisions the globals `Svg.selectAllElements` and the rect branch of
   * `mapToSvgElements` reach for, mirroring test/model/heatmap.test.ts.
   */
  function installDom(html: string): void {
    const dom = new JSDOM(html);
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = dom.window.document;
    g.SVGElement = dom.window.SVGElement;
    g.SVGRectElement = dom.window.SVGRectElement ?? dom.window.SVGElement;
    g.SVGPathElement = dom.window.SVGPathElement ?? class SVGPathElementStub {};
  }

  function uninstallDom(): void {
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.document;
    delete g.SVGElement;
    delete g.SVGRectElement;
    delete g.SVGPathElement;
  }

  afterEach(() => {
    uninstallDom();
  });

  const FIVE_RECTS = `<!doctype html><svg xmlns="http://www.w3.org/2000/svg">${
    ['e0', 'e1', 'e2', 'e3', 'e4']
      .map(id => `<rect class="bar" id="${id}"/>`)
      .join('')
  }</svg>`;

  /**
   * Reads the id of the rect the trace would highlight at a position.
   * @param values - Two series of three categories
   * @param row - Series index
   * @param col - Category index
   * @returns The rect's id, or undefined when the cell has no rendered element
   */
  function highlightedIdAt(
    values: [(number | null)[], (number | null)[]],
    row: number,
    col: number,
  ): string | undefined {
    // A fresh document per call: selecting elements inserts hidden clones, so
    // a second trace built against the same DOM would see more rects than the
    // chart has.
    installDom(FIVE_RECTS);

    const layer = stackedLayer(values[0], values[1]);
    layer.selectors = 'rect.bar';
    const trace = new SegmentedTrace(layer);

    trace.moveToIndex(row, col);
    const highlight = stateOf(trace).highlight as { empty?: boolean; elements?: SVGElement };
    return (highlight.elements as unknown as Element | undefined)?.id || undefined;
  }

  it('lets a gap stand in for an omitted element rather than consuming a real one', () => {
    // Six data cells but five rendered rects, so `skipZeros` is on: the chart
    // library left one element out. The default DOM order walks each category
    // through the series in reverse, so with the gap standing aside the row
    // reads West e0, East e1 | West e2, East gap | West e3, East e4.
    //
    // Were the gap to take a rect instead, it would consume e3 and East at Q3
    // would run past the end of the list — the cell the user is on would
    // highlight nothing at all.
    expect(highlightedIdAt([[120, null, 60], [90, 70, 20]], 0, 2)).toBe('e4');
  });

  it('aligns a gap exactly as a real zero does', () => {
    // The two must agree: this path is about which rects exist, not about what
    // a value means, and a zero has always been read as possibly-omitted.
    const withGap = highlightedIdAt([[120, null, 60], [90, 70, 20]], 0, 2);
    const withZero = highlightedIdAt([[120, 0, 60], [90, 70, 20]], 0, 2);

    expect(withGap).toBe(withZero);
  });
});

describe('segmented bar gaps', () => {
  it('keeps a gapped segment from turning the whole chart\'s pitch range to NaN', () => {
    // The Total row sums each category. Adding a gap straight in makes that
    // sum NaN, which seeds MathUtil.minMax and then spreads through
    // safeMin/safeMax over every row — so a single missing segment handed the
    // oscillator a NaN frequency for every real bar on the chart.
    const trace = new SegmentedTrace(stackedLayer([null, 80], [90, 70]));

    const state = stateOf(trace);

    expect(Number.isFinite(state.audio.freq.min)).toBe(true);
    expect(Number.isFinite(state.audio.freq.max)).toBe(true);
  });

  it('totals the measured segments of a category with a gap', () => {
    const trace = new SegmentedTrace(stackedLayer([null, 80], [90, 70]));

    const { braille } = stateOf(trace);
    const totals = (braille as BarBrailleState).values.at(-1);

    // Q1 has one real segment (90) and one gap; Q2 has both.
    expect(totals?.[0]).toBe(90);
    expect(totals?.[1]).toBe(150);
  });

  it('leaves a category with no measured segment as a gap in the total', () => {
    const trace = new SegmentedTrace(stackedLayer([null, 80], [null, 70]));

    const { braille } = stateOf(trace);
    const totals = (braille as BarBrailleState).values.at(-1);

    expect(Number.isFinite(totals?.[0] as number)).toBe(false);
    expect(totals?.[1]).toBe(150);
  });

  it('describes a stack of nothing but gaps as missing, not as an infinity', () => {
    // SegmentedTrace replaces the whole stats block rather than extending it,
    // so the guard has to be shared or this drifts back on its own.
    const trace = new SegmentedTrace(stackedLayer([null, null], [null, null]));

    const stats = trace.description.stats;

    expect(stats.find(stat => stat.label === 'Min value')?.value).toBe('missing');
    expect(stats.find(stat => stat.label === 'Max value')?.value).toBe('missing');
  });

  it('leaves a stack with no gaps totalling exactly as before', () => {
    const trace = new SegmentedTrace(stackedLayer([120, 80], [90, 70]));

    const { braille } = stateOf(trace);
    const totals = (braille as BarBrailleState).values.at(-1);

    expect(totals).toEqual([210, 150]);
  });
});
