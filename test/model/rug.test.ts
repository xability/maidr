/**
 * @jest-environment jsdom
 */
import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, RugPoint } from '@type/grammar';
import type { BarBrailleState, NonEmptyTraceState } from '@type/state';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { RugTrace } from '@model/rug';
import { Orientation, TraceType } from '@type/grammar';

/**
 * A rug is a distribution of positions, and every channel has to carry the
 * one thing the chart shows: where the observations fall and where they
 * bunch up (#1132).
 *
 * Read as a scatter with a constant on the other axis -- which is what both
 * bindings emitted -- the pitch never moved and the braille had no surface.
 * These cases pin what the trace does instead: pitch and pan follow the
 * position on the axis's own scale, braille is the count per bin along it,
 * the text says which observation this is in order, and the highlight lands
 * on the tick that draws the observation under the cursor whatever order the
 * producer listed the observations in.
 */

/**
 * Twelve observations, listed out of order on purpose, with three close
 * together near 2, one far off at 9.4, and a tie at the maximum.
 */
const OBSERVATIONS = [2.2, 1.5, 9.4, 1.7, 6.5, 2.0, 3.1, 9.4, 1.2, 4.8, 6.7, 2.3];

/** The same observations in the order the trace walks them. */
const SORTED = [...OBSERVATIONS].sort((a, b) => a - b);

/**
 * Create a vertical rug layer, optionally with the axis declared.
 * @param overrides - Fields to change on the layer
 * @returns The layer definition
 */
function createLayer(overrides: Partial<MaidrLayer> = {}): MaidrLayer {
  return {
    id: 'rug',
    type: TraceType.RUG,
    title: 'Response latency',
    axes: { x: { label: 'Seconds' } },
    data: OBSERVATIONS.map(x => ({ x })),
    ...overrides,
  };
}

/**
 * Build a trace and move it to the observation at `col` in walk order.
 * @param layer - The layer to build from
 * @param col - Which observation, counting from the lowest
 * @returns The populated state there
 */
function stateAt(layer: MaidrLayer, col: number): NonEmptyTraceState {
  const trace = TraceFactory.create(layer);
  trace.moveToIndex(0, col);
  const state = trace.state;
  if (state.empty) {
    throw new Error(`Expected a populated state at column ${col}`);
  }
  return state;
}

describe('a rug is built and walked in position order', () => {
  test('the factory builds a RugTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(RugTrace);
  });

  test('the observations are walked from the lowest position up, however they were listed', () => {
    const trace = TraceFactory.create(createLayer());
    const walked: number[] = [];
    for (let col = 0; col < OBSERVATIONS.length; col++) {
      trace.moveToIndex(0, col);
      const state = trace.state as NonEmptyTraceState;
      walked.push(state.text.main.value as number);
    }
    expect(walked).toEqual(SORTED);
  });

  test('a position that is not a number is not an observation', () => {
    const layer = createLayer({
      data: [{ x: 3 }, { x: Number.NaN }, { x: 1 }, {} as RugPoint, { x: 2 }],
    });
    const trace = TraceFactory.create(layer);
    const walked: number[] = [];
    for (let col = 0; col < 3; col++) {
      trace.moveToIndex(0, col);
      walked.push((trace.state as NonEmptyTraceState).text.main.value as number);
    }
    expect(walked).toEqual([1, 2, 3]);
    expect(trace.isMovable([0, 3])).toBe(false);
  });

  test('an empty rug answers with the empty state rather than throwing', () => {
    const trace = TraceFactory.create(createLayer({ data: [] }));
    expect(trace.state.empty).toBe(true);
    expect(trace.moveOnce('FORWARD')).toBe(false);
    expect((trace as RugTrace).getExtremaTargets()).toEqual([]);
    expect((trace as RugTrace).description.stats[0]).toEqual({ label: 'Total observations', value: 0 });
  });
});

describe('the pitch and the pan carry the position', () => {
  test('the frequency is the position read against the data span when no axis is declared', () => {
    const low = stateAt(createLayer(), 0);
    const high = stateAt(createLayer(), OBSERVATIONS.length - 1);
    expect(low.audio.freq).toEqual({ raw: 1.2, min: 1.2, max: 9.4 });
    expect(high.audio.freq).toEqual({ raw: 9.4, min: 1.2, max: 9.4 });
  });

  test('a declared axis that covers the data is the scale the pitch is read against', () => {
    const state = stateAt(createLayer({ axes: { x: { label: 'Seconds', min: 0, max: 10 } } }), 2);
    expect(state.audio.freq).toEqual({ raw: 1.7, min: 0, max: 10 });
  });

  test('a declared axis that leaves observations outside it gives way to the data', () => {
    // A rug pitched against a range it overruns would put its extremes off
    // the scale; the data's own span is the honest one then.
    const state = stateAt(createLayer({ axes: { x: { label: 'Seconds', min: 2, max: 5 } } }), 0);
    expect(state.audio.freq).toEqual({ raw: 1.2, min: 1.2, max: 9.4 });
  });

  test('the pan follows the position on the axis, not the observation index', () => {
    const layer = createLayer({ axes: { x: { label: 'Seconds', min: 0, max: 10 } } });
    // Six of twelve observations sit below 2.5, so by index the seventh
    // would already be at the middle; by position it is at 3.1 of 10.
    const seventh = stateAt(layer, 6);
    expect(seventh.audio.panning.x).toBeCloseTo(0.31);
    expect(seventh.audio.panning).toMatchObject({ y: 0, rows: 1, cols: 2 });
    const last = stateAt(layer, 11);
    expect(last.audio.panning.x).toBeCloseTo(0.94);
  });

  test('a rug of one position sits in the middle of the stereo field', () => {
    const state = stateAt(createLayer({ data: [{ x: 4 }] }), 0);
    expect(state.audio.freq).toEqual({ raw: 4, min: 4, max: 4 });
    expect(state.audio.panning.x).toBe(0.5);
  });
});

describe('the text names the position and its rank', () => {
  test('the main value is the position on the marked axis, with its rank as an aside', () => {
    const state = stateAt(createLayer(), 2);
    expect(state.text.main).toEqual({ label: 'Seconds', value: 1.7 });
    expect(state.text.mainAxis).toBe('x');
    expect(state.text.cross).toBeUndefined();
    expect(state.text.asides).toEqual([{ label: 'Observation', value: '3 of 12' }]);
  });

  test('a horizontal rug reads its position off y and announces the y axis', () => {
    const state = stateAt(createLayer({
      orientation: Orientation.HORIZONTAL,
      axes: { y: { label: 'Seconds' } },
      data: OBSERVATIONS.map(y => ({ x: 0, y })),
    }), 0);
    expect(state.text.main).toEqual({ label: 'Seconds', value: 1.2 });
    expect(state.text.mainAxis).toBe('y');
    expect(state.orientation).toBe(Orientation.HORIZONTAL);
    expect(state.audio.freq.raw).toBe(1.2);
  });

  test('the layer is announced as a rug, with its orientation', () => {
    expect(stateAt(createLayer(), 0).plotType).toBe('rug');
    expect(stateAt(createLayer(), 0).orientation).toBe(Orientation.VERTICAL);
  });
});

describe('the braille is the observation count along the axis', () => {
  /**
   * The braille state of a layer, at the observation `col`.
   * @param layer - The layer to build from
   * @param col - Which observation
   * @returns The bar-shaped braille state
   */
  function brailleAt(layer: MaidrLayer, col = 0): BarBrailleState {
    return stateAt(layer, col).braille as BarBrailleState;
  }

  test('a declared tickStep cuts the declared axis into the bins the chart draws', () => {
    const layer = createLayer({ axes: { x: { label: 'Seconds', min: 0, max: 10, tickStep: 2.5 } } });
    const braille = brailleAt(layer);
    // Six below 2.5, two in [2.5, 5), two in [5, 7.5), and the two at 9.4.
    expect(braille.values).toEqual([[6, 2, 2, 2]]);
    expect(braille.min).toEqual([0]);
    expect(braille.max).toEqual([6]);
    expect(braille.row).toBe(0);
  });

  test('the braille cursor sits in the bin the observation under the cursor falls in', () => {
    const layer = createLayer({ axes: { x: { label: 'Seconds', min: 0, max: 10, tickStep: 2.5 } } });
    expect(brailleAt(layer, 0).col).toBe(0);
    expect(brailleAt(layer, 7).col).toBe(1);
    expect(brailleAt(layer, 9).col).toBe(2);
    expect(brailleAt(layer, 11).col).toBe(3);
  });

  test('an undeclared axis is cut into square-root-many equal bins over the data', () => {
    // ceil(sqrt(12)) = 4 bins of (9.4 - 1.2) / 4 = 2.05 over [1.2, 9.4].
    const braille = brailleAt(createLayer());
    expect(braille.values[0]).toHaveLength(4);
    expect(braille.values[0].reduce((sum, count) => sum + count, 0)).toBe(OBSERVATIONS.length);
    // [1.2, 3.25): the six near 2 and 3.1; [3.25, 5.3): 4.8; [5.3, 7.35):
    // 6.5 and 6.7; [7.35, 9.4]: the two at 9.4, the maximum included.
    expect(braille.values).toEqual([[7, 1, 2, 2]]);
  });

  test('a rug of one position is one bin, full', () => {
    expect(brailleAt(createLayer({ data: [{ x: 4 }] })).values).toEqual([[1]]);
  });

  test('a tickStep that would cut the axis into too many bins is ignored', () => {
    const layer = createLayer({ axes: { x: { label: 'Seconds', min: 0, max: 10, tickStep: 0.000001 } } });
    expect(brailleAt(layer).values[0]).toHaveLength(4);
  });
});

describe('the description summarises the distribution', () => {
  test('it reports the count, the range, the median and the densest interval', () => {
    const trace = TraceFactory.create(
      createLayer({ axes: { x: { label: 'Seconds', min: 0, max: 10, tickStep: 2.5 } } }),
    ) as RugTrace;
    const { stats, dataTable, chartType, axes } = trace.description;
    expect(chartType).toBe('Rug Plot');
    expect(axes).toEqual({ x: 'Seconds' });
    expect(stats).toEqual([
      { label: 'Total observations', value: 12 },
      { label: 'Min value', value: 1.2 },
      { label: 'Max value', value: 9.4 },
      { label: 'Median', value: (2.3 + 3.1) / 2 },
      { label: 'Densest interval', value: '0 to 2.5, 6' },
    ]);
    expect(dataTable.headers).toEqual(['Seconds']);
    expect(dataTable.columnAxes).toEqual(['x']);
    expect(dataTable.rows).toEqual(SORTED.map(value => [value]));
  });
});

describe('the extremes are the ends of the rug', () => {
  test('there is one target per tick at each extreme, ties included', () => {
    const trace = TraceFactory.create(createLayer()) as RugTrace;
    const targets = trace.getExtremaTargets();
    const brief = targets.map(({ type, value, pointIndex }) => ({ type, value, pointIndex }));
    expect(brief).toEqual([
      { type: 'max', value: 9.4, pointIndex: 11 },
      { type: 'max', value: 9.4, pointIndex: 10 },
      { type: 'min', value: 1.2, pointIndex: 0 },
    ]);
    expect(targets[0].label).toBe('Max point at 9.4');
  });

  test('navigating to a target lands on that observation', () => {
    const trace = TraceFactory.create(createLayer()) as RugTrace;
    const [max] = trace.getExtremaTargets();
    trace.navigateToExtrema(max as ExtremaTarget);
    expect((trace.state as NonEmptyTraceState).text.main.value).toBe(9.4);
  });
});

describe('the rotor walks the sorted positions', () => {
  test('a higher value is the next tick and the boundary is reported at the end', () => {
    const trace = TraceFactory.create(createLayer()) as RugTrace;
    trace.moveToIndex(0, OBSERVATIONS.length - 2);
    // The last two are both 9.4, so from the second-last there is no higher.
    expect(trace.moveToNextCompareValue('right', 'higher')).toBe(false);
    expect(trace.moveToNextCompareValue('left', 'lower')).toBe(true);
    expect((trace.state as NonEmptyTraceState).text.main.value).toBe(6.7);
    expect(trace.moveToNextCompareValue('up', 'higher')).toBe(false);
  });
});

describe('the highlight lands on the tick that draws the observation', () => {
  beforeEach(() => {
    // One line per observation, in the producer's order, each stamped with
    // the observation it draws so the pairing can be read back.
    document.body.innerHTML = `
      <svg>
        <g id="rug-marks">
          ${OBSERVATIONS.map(x => `<line data-x="${x}" x1="${x * 10}" x2="${x * 10}" y1="0" y2="10"></line>`).join('')}
        </g>
      </svg>
    `;
  });

  /**
   * The observation stamped on the element highlighted at `col`.
   *
   * One trace is built per test and moved, rather than one per reading:
   * resolving a selector inserts a hidden clone beside every element it
   * matches, so a second trace over the same document would find twice the
   * ticks and decline the pairing -- the guard the last case pins.
   * @param trace - The trace to move
   * @param col - Which observation in walk order
   * @returns The `data-x` of the highlighted element
   */
  function highlightedAt(trace: RugTrace, col: number): number {
    trace.moveToIndex(0, col);
    const state = trace.state;
    if (state.empty || state.highlight.empty) {
      throw new Error(`Expected a highlight at column ${col}`);
    }
    const element = Array.isArray(state.highlight.elements)
      ? state.highlight.elements[0]
      : state.highlight.elements;
    return Number(element.getAttribute('data-x'));
  }

  test('a flat selector pairs elements in the producer order, then walks them sorted', () => {
    const trace = TraceFactory.create(createLayer({ selectors: 'g[id=\'rug-marks\'] > line' })) as RugTrace;
    for (let col = 0; col < OBSERVATIONS.length; col++) {
      expect(highlightedAt(trace, col)).toBe(SORTED[col]);
    }
  });

  test('a selector per observation pairs the same way', () => {
    const trace = TraceFactory.create(createLayer({
      selectors: OBSERVATIONS.map((_, i) => `g[id='rug-marks'] > line:nth-child(${i + 1})`),
    })) as RugTrace;
    expect(highlightedAt(trace, 0)).toBe(1.2);
    expect(highlightedAt(trace, 6)).toBe(3.1);
    expect(highlightedAt(trace, 11)).toBe(9.4);
  });

  test('a dropped observation keeps the rest paired with their own ticks', () => {
    const trace = TraceFactory.create(createLayer({
      data: OBSERVATIONS.map((x, i) => (i === 4 ? { x: Number.NaN } : { x })),
      selectors: 'g[id=\'rug-marks\'] > line',
    })) as RugTrace;
    // 6.5 was the fifth listed and is gone; 6.7 is now the ninth walked and
    // must still light its own tick rather than its neighbour's.
    expect(highlightedAt(trace, 8)).toBe(6.7);
    expect(highlightedAt(trace, 9)).toBe(9.4);
  });

  test('a selector that resolves to the wrong number of ticks highlights nothing', () => {
    const layer = createLayer({ selectors: 'g[id=\'rug-marks\'] > line:nth-child(-n+5)' });
    const trace = TraceFactory.create(layer);
    trace.moveToIndex(0, 0);
    expect((trace.state as NonEmptyTraceState).highlight.empty).toBe(true);
    // Nothing was left behind in the document either.
    expect(document.querySelectorAll('line')).toHaveLength(OBSERVATIONS.length);
  });
});
