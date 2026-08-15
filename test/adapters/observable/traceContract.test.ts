/**
 * What these tests protect, and why they are not in `converters.test.ts`.
 *
 * Every other test of this adapter asserts the schema it emits. That checks
 * the adapter against the author's belief about MAIDR's grammar, and a belief
 * is exactly the thing that was wrong: a layer's orientation does not annotate
 * its points, it *transposes* them — `AbstractBarPlot` reads the measurement
 * from `point.y` when the layer is vertical and from `point.x` when it is
 * horizontal. Emitting both the same way round produced schemas that looked
 * perfectly well formed and, run through the trace that consumes them, gave
 * `Number('Mon')`: no sonification, no braille, a description whose minimum and
 * maximum are "missing". A chart that binds and reads as nothing at all.
 *
 * So these tests convert a real Plot chart and then construct the real trace
 * from the layer, asserting on what a reader is actually given. Nothing between
 * the adapter and the announcement is stubbed, which is the only way this class
 * of defect is visible at all.
 */

import type { MaidrLayer } from '@type/grammar';
import type { TraceState } from '@type/state';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { BarTrace } from '@model/bar';
import { Histogram } from '@model/histogram';
import { Orientation } from '@type/grammar';
import { mountFixture } from './helpers';

const savedDocument = globalThis.document;

afterEach(() => {
  Object.assign(globalThis, { document: savedDocument });
});

/**
 * Converts a fixture and returns its single layer.
 *
 * The fixture's document is installed globally for the rest of the test: a
 * trace resolves its layer's selector against `document` when it is
 * constructed, which is the step that pairs each datum with the element it
 * describes, and it is part of what these tests are checking.
 */
function layerOf(key: Parameters<typeof mountFixture>[0]): MaidrLayer {
  const { dom, element } = mountFixture(key);
  const layer = observablePlotToMaidr(element)?.subplots[0][0].layers[0];
  if (!layer)
    throw new Error(`fixture "${String(key)}" produced no layer`);
  Object.assign(globalThis, { document: dom.window.document });
  return layer;
}

/** The populated state of a trace, or a failure if it has none. */
function stateOf(trace: BarTrace | Histogram): Extract<TraceState, { empty: false }> {
  const state = trace.state;
  if (state.empty || state.type !== 'trace')
    throw new Error('expected a populated trace state');
  return state;
}

/** Every value the trace would sonify, in navigation order. */
function announced(trace: BarTrace | Histogram, count: number): (number | null)[] {
  const values: (number | null)[] = [];
  for (let index = 0; index < count; index++) {
    trace.moveToIndex(0, index);
    const { audio } = stateOf(trace);
    const raw = audio.freq.raw;
    values.push(typeof raw === 'number' && Number.isFinite(raw) ? raw : null);
  }
  return values;
}

describe('what a trace makes of the layers this adapter emits', () => {
  it('sonifies a vertical bar chart with the values it was drawn from', () => {
    const layer = layerOf('bar');
    const trace = new BarTrace(layer);

    expect(layer.orientation).toBe(Orientation.VERTICAL);
    expect(announced(trace, 3)).toEqual([20, 14, 23]);
  });

  it('sonifies a horizontal bar chart with the values, not the categories', () => {
    // The defect: `barX` puts the categories on the y axis, and a horizontal
    // layer carries its measurement on `x`. Emitted the vertical way round,
    // every bar sonified as `Number('Mon')` — silence, on a chart that reports
    // itself as bound.
    const layer = layerOf('horizontalBar');
    const trace = new BarTrace(layer);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(announced(trace, 3)).toEqual([20, 14, 23]);
    const { audio } = stateOf(trace);
    expect(audio.freq.min).toBe(14);
    expect(audio.freq.max).toBe(23);
  });

  it('names the categories of a horizontal bar chart on the axis it reads them from', () => {
    const trace = new BarTrace(layerOf('horizontalBar'));

    trace.moveToIndex(0, 0);
    const { text } = stateOf(trace);

    expect(`${text.main?.value ?? ''}`).toBe('Mon');
  });

  it('sonifies a vertical histogram with its frequencies', () => {
    const trace = new Histogram(layerOf('histogram'));

    expect(announced(trace, 7)).toEqual([7, 6, 6, 6, 6, 6, 3]);
  });

  it('sonifies a horizontal histogram with its frequencies, not its bin midpoints', () => {
    // Same defect, worse disguise: the midpoints are numbers, so the chart
    // sonified a smooth ramp — plausible, and unrelated to the data.
    const layer = layerOf('horizontalHistogram');
    const trace = new Histogram(layer);

    expect(layer.orientation).toBe(Orientation.HORIZONTAL);
    expect(announced(trace, 5)).toEqual([8, 8, 8, 8, 8]);
  });

  it('reports a horizontal histogram\'s bin bounds as the interval it binned', () => {
    const trace = new Histogram(layerOf('horizontalHistogram'));

    trace.moveToIndex(0, 0);
    const { text } = stateOf(trace);

    // `Histogram` reads the bounds off `yMin`/`yMax` for a horizontal layer, so
    // announcing the interval at all depends on them being the ones carrying it.
    expect(text.range).toEqual({ min: 0, max: 2 });
  });
});
