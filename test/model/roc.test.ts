import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, RocPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { RocTrace } from '@model/roc';
import { TraceType } from '@type/grammar';

/**
 * Two classifiers over the same test set.
 *
 * Logistic regression declares no area, so it is measured from its points:
 * 0.89575 by the trapezoid rule. Random forest declares the area its
 * producer computed, 0.728, which the trapezoid rule over its points also
 * gives -- so a reading that ignored the declaration could not be told apart
 * by that curve, and the test that pins the declaration uses a number the
 * points do not give.
 */
const LOGISTIC: RocPoint[] = [
  { x: 0, y: 0, threshold: 1, z: 'Logistic' },
  { x: 0.05, y: 0.55, threshold: 0.8, z: 'Logistic' },
  { x: 0.1, y: 0.75, threshold: 0.6, z: 'Logistic' },
  { x: 0.2, y: 0.86, threshold: 0.45, z: 'Logistic' },
  { x: 0.35, y: 0.93, threshold: 0.3, z: 'Logistic' },
  { x: 0.6, y: 0.98, threshold: 0.15, z: 'Logistic' },
  { x: 1, y: 1, threshold: 0, z: 'Logistic' },
];

const FOREST: RocPoint[] = [
  { x: 0, y: 0, threshold: 1, z: 'Forest', auc: 0.728 },
  { x: 0.1, y: 0.4, threshold: 0.7, z: 'Forest' },
  { x: 0.25, y: 0.6, threshold: 0.5, z: 'Forest' },
  { x: 0.45, y: 0.78, threshold: 0.35, z: 'Forest' },
  { x: 0.7, y: 0.9, threshold: 0.2, z: 'Forest' },
  { x: 1, y: 1, threshold: 0, z: 'Forest' },
];

/**
 * Create a ROC layer.
 * @param data - The curves the layer carries
 * @param overrides - Fields to change on the layer
 * @returns The layer definition
 */
function createLayer(
  data: RocPoint[][] = [LOGISTIC, FOREST],
  overrides: Partial<MaidrLayer> = {},
): MaidrLayer {
  return {
    id: 'roc',
    type: TraceType.ROC,
    title: 'Two classifiers',
    axes: { x: { label: 'False positive rate' }, y: { label: 'True positive rate' } },
    data,
    ...overrides,
  };
}

/**
 * Build a ROC trace positioned on one point of one curve.
 * @param row - Which curve
 * @param col - Which operating point
 * @param data - The curves the layer carries
 * @returns The positioned trace
 */
function roc(row = 0, col = 0, data: RocPoint[][] = [LOGISTIC, FOREST]): RocTrace {
  const trace = TraceFactory.create(createLayer(data)) as RocTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function stateOf(trace: RocTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * The value of one description stat, by label.
 * @param trace - The trace to describe
 * @param label - The stat's label
 * @returns Its value, or undefined when the description has no such stat
 */
function stat(trace: RocTrace, label: string): string | number | undefined {
  return trace.description.stats.find(entry => entry.label === label)?.value;
}

describe('roc registration', () => {
  test('the factory builds a RocTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(RocTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(roc().description.chartType).toBe('ROC Curve');
    expect(stateOf(roc()).plotType).toBe('roc');
    // Whether it holds one curve or several: the line says "line" or
    // "multiline", and neither tells a reader what the axes are.
    expect(stateOf(roc(0, 0, [LOGISTIC])).plotType).toBe('roc');
  });

  test('an empty layer answers with the empty state rather than throwing', () => {
    const trace = TraceFactory.create(createLayer([])) as RocTrace;
    expect(trace.state.empty).toBe(true);
    expect(trace.getExtremaTargets()).toEqual([]);
    expect(trace.description.stats).toEqual(expect.arrayContaining([
      { label: 'Number of curves', value: 0 },
    ]));
  });
});

describe('the pitch is the rate on the unit interval', () => {
  test('every curve is read against 0 to 1, not its own range', () => {
    // Both curves run from (0, 0) to (1, 1), so per-curve scaling could not
    // be told apart here -- which is why the truncated curve below exists.
    expect(stateOf(roc(0, 2)).audio.freq).toEqual({ raw: 0.75, min: 0, max: 1 });
    expect(stateOf(roc(1, 2)).audio.freq).toEqual({ raw: 0.6, min: 0, max: 1 });
  });

  test('a curve that stops short of (1, 1) keeps the unit register', () => {
    const truncated: RocPoint[] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.4 },
      { x: 0.3, y: 0.5 },
    ];
    expect(stateOf(roc(0, 2, [truncated])).audio.freq).toEqual({ raw: 0.5, min: 0, max: 1 });
  });

  test('rates given as percentages widen the register rather than clipping', () => {
    const percent: RocPoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 80 },
      { x: 100, y: 100 },
    ];
    expect(stateOf(roc(0, 1, [percent])).audio.freq).toEqual({ raw: 80, min: 0, max: 100 });
  });

  test('the pan follows the false positive rate, not the column index', () => {
    // Column 5 of 7 sits at x = 0.6: panned by index it would be well
    // right of centre, panned by rate it is just past it.
    const { panning } = stateOf(roc(0, 5)).audio;
    expect(panning).toEqual({ x: 0.6, y: 0, rows: 2, cols: 2 });
    expect(stateOf(roc(1, 0)).audio.panning).toEqual({ x: 0, y: 1, rows: 2, cols: 2 });
  });
});

describe('each point says its threshold and where it stands against chance', () => {
  test('the rates are announced against their axes and the curve is named', () => {
    const { text } = stateOf(roc(0, 3));
    expect(text.main).toEqual({ label: 'False positive rate', value: 0.2 });
    expect(text.cross).toEqual({ label: 'True positive rate', value: 0.86 });
    expect(text.z).toEqual({ label: 'Curve', value: 'Logistic' });
  });

  test('the threshold and the height above chance travel as asides', () => {
    expect(stateOf(roc(0, 3)).text.asides).toEqual([
      { label: 'Threshold', value: '0.45' },
      { label: 'Above chance', value: '0.66' },
    ]);
  });

  test('a point under the diagonal is named by direction rather than signed', () => {
    const below: RocPoint[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.3 },
      { x: 1, y: 1 },
    ];
    expect(stateOf(roc(0, 1, [below])).text.asides).toEqual([
      { label: 'Below chance', value: '0.2' },
    ]);
  });

  test('a point on the diagonal is above chance by nothing', () => {
    expect(stateOf(roc(0, 0)).text.asides).toEqual([
      { label: 'Threshold', value: '1' },
      { label: 'Above chance', value: '0' },
    ]);
  });

  test('a curve of rates alone announces no threshold', () => {
    const bare: RocPoint[] = [{ x: 0, y: 0 }, { x: 0.1, y: 0.8 }, { x: 1, y: 1 }];
    expect(stateOf(roc(0, 1, [bare])).text.asides).toEqual([
      { label: 'Above chance', value: '0.7' },
    ]);
  });

  test('a gap is announced as missing and carries no height', () => {
    const gapped: RocPoint[] = [{ x: 0, y: 0 }, { x: 0.1, y: null, threshold: 0.5 }, { x: 1, y: 1 }];
    const { text } = stateOf(roc(0, 1, [gapped]));
    expect(text.cross?.value).toBeNaN();
    expect(text.asides).toEqual([{ label: 'Threshold', value: '0.5' }]);
  });
});

describe('the description gives the numbers the chart is quoted by', () => {
  test('the area is measured from the points when none is declared', () => {
    expect(stat(roc(), 'Area under the curve')).toBe('Logistic, 0.896, Forest, 0.728');
  });

  test('a single curve reports its area on its own', () => {
    expect(stat(roc(0, 0, [LOGISTIC]), 'Area under the curve')).toBe('0.896');
    expect(stat(roc(0, 0, [LOGISTIC]), 'Highest area under the curve')).toBeUndefined();
  });

  test('a declared area wins over the measured one', () => {
    // 0.5 is not what the points give, so a reading that measured anyway
    // would fail here.
    const declared = FOREST.map((point, index) => (index === 0 ? { ...point, auc: 0.5 } : point));
    expect(stat(roc(0, 0, [declared]), 'Area under the curve')).toBe('0.500');
  });

  test('a curve listed from (1, 1) down has the same area', () => {
    const reversed = [...LOGISTIC].reverse();
    expect(stat(roc(0, 0, [reversed]), 'Area under the curve')).toBe('0.896');
  });

  test('a gap is left out of the area rather than counted as zero', () => {
    const gapped = LOGISTIC.map((point, index) => (index === 3 ? { ...point, y: null } : point));
    // Without (0.2, 0.86): 0.1 -> 0.35 is one trapezoid of (0.75 + 0.93) / 2 * 0.25.
    expect(stat(roc(0, 0, [gapped]), 'Area under the curve')).toBe('0.891');
  });

  test('a curve of one point has no area to report', () => {
    expect(stat(roc(0, 0, [[{ x: 0.5, y: 0.5 }]]), 'Area under the curve')).toBe('missing');
  });

  test('the highest area names the classifier to prefer', () => {
    expect(stat(roc(), 'Highest area under the curve')).toBe('Logistic, 0.896');
  });

  test('the best operating point is the one furthest above chance, with its threshold', () => {
    expect(stat(roc(), 'Best operating point'))
      .toBe('Logistic, False positive rate 0.2, True positive rate 0.86, at threshold 0.45');
  });

  test('a single curve states its best operating point without a name', () => {
    expect(stat(roc(0, 0, [FOREST]), 'Best operating point'))
      .toBe('False positive rate 0.25, True positive rate 0.6, at threshold 0.5');
  });

  test('a best operating point without a threshold is stated by its rates alone', () => {
    const bare: RocPoint[] = [{ x: 0, y: 0 }, { x: 0.1, y: 0.8 }, { x: 1, y: 1 }];
    expect(stat(roc(0, 0, [bare]), 'Best operating point'))
      .toBe('False positive rate 0.1, True positive rate 0.8');
  });

  test('a curve below chance is counted, and the count is silent otherwise', () => {
    expect(stat(roc(), 'Curves below chance')).toBeUndefined();
    const worse: RocPoint[] = [{ x: 0, y: 0 }, { x: 0.6, y: 0.2 }, { x: 1, y: 1 }];
    expect(stat(roc(0, 0, [LOGISTIC, worse]), 'Curves below chance')).toBe(1);
  });

  test('the min and max of a rate axis are not reported', () => {
    // They are 0 and 1 on every complete ROC curve, and so worth nothing.
    expect(stat(roc(), 'Min value')).toBeUndefined();
    expect(stat(roc(), 'Max value')).toBeUndefined();
  });

  test('the series are described as curves', () => {
    expect(stat(roc(), 'Number of curves')).toBe(2);
    expect(stat(roc(), 'Operating points per curve')).toBe('6 to 7');
    expect(stat(roc(), 'Curve names')).toBe('Logistic, Forest');
  });

  test('the table carries the threshold beside the rates', () => {
    const { dataTable } = roc().description;
    expect(dataTable.headers).toEqual([
      'False positive rate',
      'True positive rate',
      'Threshold',
      'Curve',
    ]);
    expect(dataTable.columnAxes).toEqual(['x', 'y', undefined, 'z']);
    expect(dataTable.rows[3]).toEqual([0.2, 0.86, 0.45, 'Logistic']);
    expect(dataTable.rows).toHaveLength(13);
  });

  test('a curve of rates alone keeps the line\'s table', () => {
    const bare: RocPoint[] = [{ x: 0, y: 0 }, { x: 0.1, y: 0.8 }, { x: 1, y: 1 }];
    const { dataTable } = roc(0, 0, [bare]).description;
    expect(dataTable.headers).toEqual(['False positive rate', 'True positive rate']);
    expect(dataTable.rows).toEqual([[0, 0], [0.1, 0.8], [1, 1]]);
  });
});

describe('the up and down keys move between curves at the cursor\'s false positive rate', () => {
  /**
   * Where the cursor is after a move, as the reader hears it.
   * @param trace - The trace to read
   * @returns The curve's name and the point's rates
   */
  function at(trace: RocTrace): { curve: unknown; fpr: unknown; tpr: unknown } {
    const { group, text } = stateOf(trace);
    return { curve: group?.value, fpr: text.main.value, tpr: text.cross?.value };
  }

  test('down goes to the curve below, though it has no point at this rate', () => {
    // Logistic (0.05, 0.55); the forest is drawn at 0.2 there, between its
    // points at 0 and 0.1. Both are as near in x, so the one nearer in rate.
    const trace = roc(0, 1);

    expect(trace.isMovable('DOWNWARD')).toBe(true);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Forest', fpr: 0.1, tpr: 0.4 });
  });

  test('up goes to the curve above, landing on its nearest point', () => {
    // Forest (0.25, 0.6); logistic is drawn at 0.883 there.
    const trace = roc(1, 2);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Logistic', fpr: 0.2, tpr: 0.86 });
  });

  test('a direction with no curve that way is out of bounds', () => {
    const trace = roc(0, 1);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
    expect(at(trace)).toEqual({ curve: 'Logistic', fpr: 0.05, tpr: 0.55 });
  });

  test('curves level at a corner are stacked in series order', () => {
    // Every curve is at (0, 0), which the line reads as neither above nor
    // below and so refuses; here the first curve is on top.
    const trace = roc(0, 0);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Forest', fpr: 0, tpr: 0 });
    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Logistic', fpr: 0, tpr: 0 });
  });

  test('three curves level at a corner are walked one at a time', () => {
    const third: RocPoint[] = [{ x: 0, y: 0, z: 'Third' }, { x: 0.5, y: 0.5, z: 'Third' }, { x: 1, y: 1, z: 'Third' }];
    const trace = roc(2, 0, [LOGISTIC, FOREST, third]);

    trace.moveOnce('UPWARD');
    expect(at(trace).curve).toBe('Forest');
    trace.moveOnce('UPWARD');
    expect(at(trace).curve).toBe('Logistic');
  });

  test('the nearest curve in that direction wins', () => {
    // At 0.5 the logistic is drawn at 0.952 and the forest at 0.804; a
    // curve at 0.9 is nearer the forest going up than the logistic.
    const middle: RocPoint[] = [{ x: 0, y: 0, z: 'Middle' }, { x: 0.5, y: 0.82, z: 'Middle' }, { x: 1, y: 1, z: 'Middle' }];
    const trace = roc(2, 1, [LOGISTIC, FOREST, middle]);

    trace.moveOnce('DOWNWARD');
    expect(at(trace).curve).toBe('Forest');
    trace.moveToIndex(2, 1);
    trace.moveOnce('UPWARD');
    expect(at(trace).curve).toBe('Logistic');
  });

  test('a cursor inside a vertical run of the other curve is level with it', () => {
    // The other curve climbs from 0 to 0.5 at x = 0, as `roc_curve` output
    // does; a cursor at 0.3 there is neither above nor below it.
    const flat: RocPoint[] = [{ x: 0, y: 0.3, z: 'Flat' }, { x: 1, y: 1, z: 'Flat' }];
    const run: RocPoint[] = [{ x: 0, y: 0, z: 'Run' }, { x: 0, y: 0.5, z: 'Run' }, { x: 1, y: 1, z: 'Run' }];
    const trace = roc(0, 0, [flat, run]);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    // Both points of the run are at x = 0; the one nearer in rate.
    expect(at(trace)).toEqual({ curve: 'Run', fpr: 0, tpr: 0.5 });
  });

  test('a curve not drawn at this rate is not a neighbour', () => {
    const partial: RocPoint[] = [{ x: 0.5, y: 0.2, z: 'Partial' }, { x: 1, y: 1, z: 'Partial' }];
    const trace = roc(0, 1, [LOGISTIC, partial]);

    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.moveOnce('DOWNWARD')).toBe(false);
  });

  test('a gap at the cursor has no rate to compare', () => {
    const gapped: RocPoint[] = [{ x: 0, y: 0, z: 'Gapped' }, { x: 0.1, y: null, z: 'Gapped' }, { x: 1, y: 1, z: 'Gapped' }];
    const trace = roc(0, 1, [gapped, FOREST]);

    expect(trace.isMovable('DOWNWARD')).toBe(false);
    expect(trace.isMovable('UPWARD')).toBe(false);
  });

  test('the producer\'s order does not matter', () => {
    // A curve listed from (1, 1) down, as the thresholds come out.
    const reversed = [...FOREST].reverse();
    const trace = roc(0, 1, [LOGISTIC, reversed]);

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Forest', fpr: 0.1, tpr: 0.4 });
  });
});

describe('a point two curves share sounds as both', () => {
  test('moving onto a shared corner carries every curve at it', () => {
    const trace = roc(0, 0);

    trace.moveOnce('DOWNWARD');

    const { intersections } = stateOf(trace);
    expect(intersections?.map(tone => tone.group)).toEqual([0, 1]);
    // From where the point is, for every tone in the chord.
    expect(intersections?.map(tone => tone.panning)).toEqual([
      { x: 0, y: 1, rows: 2, cols: 2 },
      { x: 0, y: 1, rows: 2, cols: 2 },
    ]);
  });

  test('the rotor\'s next intersection is the far corner, carrying both curves', () => {
    const trace = roc(0, 0);

    expect(trace.supportsIntersectionMode()).toBe(true);
    expect(trace.moveToNextIntersection()).toBe(true);

    const state = stateOf(trace);
    expect(state.text.main.value).toBe(1);
    expect(state.intersections?.map(tone => tone.group)).toEqual([0, 1]);
    expect(state.intersections?.[0].panning.x).toBe(1);
  });

  test('a point one curve has to itself sounds alone', () => {
    expect(stateOf(roc(0, 1)).intersections).toBeUndefined();
  });
});

describe('the extremes are the best operating point, not the corners', () => {
  test('the target is the point furthest above chance on the current curve', () => {
    const targets = roc(1, 0).getExtremaTargets();
    const best = targets.find(target => target.type === 'max') as ExtremaTarget;
    expect(best.label).toBe('Best operating point at 0.25');
    expect(best.pointIndex).toBe(2);
    expect(best.value).toBe(0.6);
    expect(targets.some(target => target.type === 'min')).toBe(false);
  });

  test('every point tied for best is offered', () => {
    const tied: RocPoint[] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0.6 },
      { x: 0.3, y: 0.8 },
      { x: 1, y: 1 },
    ];
    const targets = roc(0, 0, [tied]).getExtremaTargets().filter(target => target.type === 'max');
    expect(targets.map(target => target.pointIndex)).toEqual([1, 2]);
  });

  test('navigating to the target lands on it', () => {
    const trace = roc(0, 0);
    const [best] = trace.getExtremaTargets();
    trace.navigateToExtrema(best);
    expect(stateOf(trace).text.main.value).toBe(0.2);
    expect(stateOf(trace).text.asides?.[0]).toEqual({ label: 'Threshold', value: '0.45' });
  });
});
