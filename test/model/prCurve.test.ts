import type { ExtremaTarget } from '@type/extrema';
import type { MaidrLayer, PrCurvePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { PrCurveTrace } from '@model/prCurve';
import { TraceType } from '@type/grammar';

/**
 * Two classifiers over the same test set, 30% of it positive, listed the way
 * `precision_recall_curve` returns them: from a recall of 1 down to 0, the
 * last point without a threshold.
 *
 * Logistic regression's average precision, by the step sum, is
 * 0.3 * 0.95 + 0.3 * 0.85 + 0.2 * 0.7 + 0.1 * 0.5 + 0.1 * 0.3 = 0.76; its
 * best F1 is 0.747, at (0.8, 0.7). The forest's is
 * 0.35 * 0.72 + 0.25 * 0.56 + 0.2 * 0.4 + 0.2 * 0.3 = 0.532, best F1 0.579
 * at (0.6, 0.56).
 */
const LOGISTIC: PrCurvePoint[] = [
  { x: 1, y: 0.3, threshold: 0.05, z: 'Logistic', prevalence: 0.3 },
  { x: 0.9, y: 0.5, threshold: 0.2, z: 'Logistic' },
  { x: 0.8, y: 0.7, threshold: 0.4, z: 'Logistic' },
  { x: 0.6, y: 0.85, threshold: 0.6, z: 'Logistic' },
  { x: 0.3, y: 0.95, threshold: 0.8, z: 'Logistic' },
  { x: 0, y: 1, z: 'Logistic' },
];

const FOREST: PrCurvePoint[] = [
  { x: 1, y: 0.3, threshold: 0.1, z: 'Forest', prevalence: 0.3 },
  { x: 0.8, y: 0.4, threshold: 0.3, z: 'Forest' },
  { x: 0.6, y: 0.56, threshold: 0.5, z: 'Forest' },
  { x: 0.35, y: 0.72, threshold: 0.7, z: 'Forest' },
  { x: 0, y: 1, z: 'Forest' },
];

/**
 * A curve with its prevalence taken off.
 * @param curve - The curve
 * @returns The same points, no point declaring a prevalence
 */
function withoutPrevalence(curve: PrCurvePoint[]): PrCurvePoint[] {
  return curve.map(({ prevalence: _prevalence, ...point }) => point);
}

/**
 * Create a precision-recall layer.
 * @param data - The curves the layer carries
 * @returns The layer definition
 */
function createLayer(data: PrCurvePoint[][] = [LOGISTIC, FOREST]): MaidrLayer {
  return {
    id: 'pr',
    type: TraceType.PR_CURVE,
    title: 'Two classifiers',
    axes: { x: { label: 'Recall' }, y: { label: 'Precision' } },
    data,
  };
}

/**
 * Build a precision-recall trace positioned on one point of one curve.
 * @param row - Which curve
 * @param col - Which point
 * @param data - The curves the layer carries
 * @returns The positioned trace
 */
function pr(row = 0, col = 0, data: PrCurvePoint[][] = [LOGISTIC, FOREST]): PrCurveTrace {
  const trace = TraceFactory.create(createLayer(data)) as PrCurveTrace;
  trace.moveToIndex(row, col);
  return trace;
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function stateOf(trace: PrCurveTrace): NonEmptyTraceState {
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
function stat(trace: PrCurveTrace, label: string): string | number | undefined {
  return trace.description.stats.find(entry => entry.label === label)?.value;
}

describe('precision-recall registration', () => {
  test('the wire value is pr_curve', () => {
    expect(TraceType.PR_CURVE).toBe('pr_curve');
  });

  test('the factory builds a PrCurveTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(PrCurveTrace);
  });

  test('announces itself as the chart it is', () => {
    expect(pr().description.chartType).toBe('Precision-Recall Curve');
    expect(stateOf(pr()).plotType).toBe('precision-recall');
    expect(stateOf(pr(0, 0, [LOGISTIC])).plotType).toBe('precision-recall');
  });

  test('an empty layer answers with the empty state rather than throwing', () => {
    const trace = TraceFactory.create(createLayer([])) as PrCurveTrace;
    expect(trace.state.empty).toBe(true);
    expect(trace.getExtremaTargets()).toEqual([]);
    expect(trace.description.stats).toEqual(expect.arrayContaining([
      { label: 'Number of curves', value: 0 },
    ]));
  });
});

describe('the pitch is the precision on the unit interval', () => {
  test('every curve is read against 0 to 1, not its own range', () => {
    expect(stateOf(pr(0, 2)).audio.freq).toEqual({ raw: 0.7, min: 0, max: 1 });
    expect(stateOf(pr(1, 2)).audio.freq).toEqual({ raw: 0.56, min: 0, max: 1 });
  });

  test('the pan follows the recall, not the column index', () => {
    // Column 3 of 6 sits at a recall of 0.6.
    expect(stateOf(pr(0, 3)).audio.panning).toEqual({ x: 0.6, y: 0, rows: 2, cols: 2 });
    expect(stateOf(pr(1, 0)).audio.panning).toEqual({ x: 1, y: 1, rows: 2, cols: 2 });
  });
});

describe('each point says its threshold and where it stands against the baseline', () => {
  test('precision and recall are announced against their axes and the curve is named', () => {
    const { text } = stateOf(pr(0, 2));
    expect(text.main).toEqual({ label: 'Recall', value: 0.8 });
    expect(text.cross).toEqual({ label: 'Precision', value: 0.7 });
    expect(text.z).toEqual({ label: 'Curve', value: 'Logistic' });
  });

  test('the threshold and the height above the baseline travel as asides', () => {
    expect(stateOf(pr(0, 2)).text.asides).toEqual([
      { label: 'Threshold', value: '0.4' },
      { label: 'Above baseline', value: '0.4' },
    ]);
  });

  test('a point under the baseline is named by direction rather than signed', () => {
    const under: PrCurvePoint[] = [
      { x: 1, y: 0.3, prevalence: 0.3 },
      { x: 0.5, y: 0.2 },
      { x: 0, y: 1 },
    ];
    expect(stateOf(pr(0, 1, [under])).text.asides).toEqual([
      { label: 'Below baseline', value: '0.1' },
    ]);
  });

  test('a point without a threshold announces only the baseline', () => {
    expect(stateOf(pr(0, 5)).text.asides).toEqual([
      { label: 'Above baseline', value: '0.7' },
    ]);
  });

  test('a curve that declares no prevalence says nothing about a baseline', () => {
    expect(stateOf(pr(0, 2, [withoutPrevalence(LOGISTIC)])).text.asides).toEqual([
      { label: 'Threshold', value: '0.4' },
    ]);
  });

  test('a gap is announced as missing and carries no baseline', () => {
    const gapped: PrCurvePoint[] = [
      { x: 1, y: 0.3, prevalence: 0.3 },
      { x: 0.5, y: null, threshold: 0.5 },
      { x: 0, y: 1 },
    ];
    const { text } = stateOf(pr(0, 1, [gapped]));
    expect(text.cross?.value).toBeNaN();
    expect(text.asides).toEqual([{ label: 'Threshold', value: '0.5' }]);
  });
});

describe('the description gives the numbers the chart is quoted by', () => {
  test('the average precision is measured from the points when none is declared', () => {
    expect(stat(pr(), 'Average precision')).toBe('Logistic, 0.760, Forest, 0.532');
  });

  test('a single curve reports its average precision on its own', () => {
    expect(stat(pr(0, 0, [LOGISTIC]), 'Average precision')).toBe('0.760');
    expect(stat(pr(0, 0, [LOGISTIC]), 'Highest average precision')).toBeUndefined();
  });

  test('a declared average precision wins over the measured one', () => {
    const declared = FOREST.map((point, index) => (index === 0 ? { ...point, ap: 0.5 } : point));
    expect(stat(pr(0, 0, [declared]), 'Average precision')).toBe('0.500');
  });

  test('the order the points are listed in does not matter', () => {
    expect(stat(pr(0, 0, [[...LOGISTIC].reverse()]), 'Average precision')).toBe('0.760');
  });

  test('points sharing a recall step at the highest precision among them', () => {
    // sklearn puts the strictest of the thresholds that find the same
    // positives beside the rise, and it has the highest precision.
    const tied: PrCurvePoint[] = [
      { x: 1, y: 0.4 },
      { x: 0.5, y: 0.6 },
      { x: 0.5, y: 0.8 },
      { x: 0, y: 1 },
    ];
    // 0.5 * 0.8 + 0.5 * 0.4
    expect(stat(pr(0, 0, [tied]), 'Average precision')).toBe('0.600');
  });

  test('the step sum starts from a recall of 0', () => {
    // A curve whose lowest recall is 0.5 still owes the rise from 0 to it.
    const partial: PrCurvePoint[] = [{ x: 1, y: 0.5 }, { x: 0.5, y: 0.9 }];
    expect(stat(pr(0, 0, [partial]), 'Average precision')).toBe('0.700');
  });

  test('a curve with no measured point has no average precision', () => {
    expect(stat(pr(0, 0, [[{ x: 0.5, y: null }]]), 'Average precision')).toBe('missing');
  });

  test('the highest average precision names the classifier to prefer', () => {
    expect(stat(pr(), 'Highest average precision')).toBe('Logistic, 0.760');
  });

  test('a baseline the curves share is stated once', () => {
    expect(stat(pr(), 'Baseline precision')).toBe('0.3');
  });

  test('baselines that differ are stated per curve', () => {
    const rarer = FOREST.map((point, index) => (index === 0 ? { ...point, prevalence: 0.1 } : point));
    expect(stat(pr(0, 0, [LOGISTIC, rarer]), 'Baseline precision')).toBe('Logistic, 0.3, Forest, 0.1');
    expect(stat(pr(0, 0, [LOGISTIC, withoutPrevalence(FOREST)]), 'Baseline precision'))
      .toBe('Logistic, 0.3, Forest, missing');
  });

  test('each average precision is compared with its baseline', () => {
    expect(stat(pr(), 'Average precision against the baseline'))
      .toBe('Logistic, 0.460 above, Forest, 0.232 above');
    expect(stat(pr(0, 0, [LOGISTIC]), 'Average precision against the baseline')).toBe('0.460 above');
  });

  test('a curve below its baseline is counted, and the count is silent otherwise', () => {
    expect(stat(pr(), 'Curves below the baseline')).toBeUndefined();
    const worse: PrCurvePoint[] = [{ x: 1, y: 0.3, prevalence: 0.3 }, { x: 0.5, y: 0.2 }, { x: 0, y: 0.2 }];
    // 0.5 * 0.2 + 0.5 * 0.3 = 0.25, under 0.3.
    expect(stat(pr(0, 0, [LOGISTIC, worse]), 'Average precision against the baseline'))
      .toBe('Logistic, 0.460 above, Curve 2, 0.050 below');
    expect(stat(pr(0, 0, [LOGISTIC, worse]), 'Curves below the baseline')).toBe(1);
  });

  test('a chart with no declared prevalence reports no baseline at all', () => {
    const trace = pr(0, 0, [withoutPrevalence(LOGISTIC), withoutPrevalence(FOREST)]);
    expect(stat(trace, 'Baseline precision')).toBeUndefined();
    expect(stat(trace, 'Average precision against the baseline')).toBeUndefined();
    expect(stat(trace, 'Curves below the baseline')).toBeUndefined();
  });

  test('the best F1 is stated with its rates and threshold', () => {
    expect(stat(pr(), 'Best F1')).toBe('Logistic, Recall 0.8, Precision 0.7, F1 0.747, at threshold 0.4');
    expect(stat(pr(0, 0, [FOREST]), 'Best F1')).toBe('Recall 0.6, Precision 0.56, F1 0.579, at threshold 0.5');
  });

  test('a best F1 without a threshold is stated by its rates alone', () => {
    const bare: PrCurvePoint[] = [{ x: 1, y: 0.3 }, { x: 0.7, y: 0.8 }, { x: 0, y: 1 }];
    expect(stat(pr(0, 0, [bare]), 'Best F1')).toBe('Recall 0.7, Precision 0.8, F1 0.747');
  });

  test('the min and max of the precision axis are not reported', () => {
    expect(stat(pr(), 'Min value')).toBeUndefined();
    expect(stat(pr(), 'Max value')).toBeUndefined();
  });

  test('the series are described as curves', () => {
    expect(stat(pr(), 'Number of curves')).toBe(2);
    expect(stat(pr(), 'Operating points per curve')).toBe('5 to 6');
    expect(stat(pr(), 'Curve names')).toBe('Logistic, Forest');
  });

  test('the table carries the threshold beside the rates', () => {
    const { dataTable } = pr().description;
    expect(dataTable.headers).toEqual(['Recall', 'Precision', 'Threshold', 'Curve']);
    expect(dataTable.columnAxes).toEqual(['x', 'y', undefined, 'z']);
    expect(dataTable.rows[2]).toEqual([0.8, 0.7, 0.4, 'Logistic']);
    expect(dataTable.rows[5]).toEqual([0, 1, '', 'Logistic']);
    expect(dataTable.rows).toHaveLength(11);
  });
});

describe('the up and down keys move between curves at the cursor\'s recall', () => {
  /**
   * Where the cursor is after a move, as the reader hears it.
   * @param trace - The trace to read
   * @returns The curve's name and the point's rates
   */
  function at(trace: PrCurveTrace): { curve: unknown; recall: unknown; precision: unknown } {
    const { group, text } = stateOf(trace);
    return { curve: group?.value, recall: text.main.value, precision: text.cross?.value };
  }

  test('down goes to the curve below at the same recall', () => {
    // Logistic (0.8, 0.7); the forest has a point at a recall of 0.8, at 0.4.
    const trace = pr(0, 2);

    expect(trace.moveOnce('DOWNWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Forest', recall: 0.8, precision: 0.4 });
  });

  test('up goes to the curve above, though it has no point at this recall', () => {
    // Forest (0.35, 0.72); the logistic is drawn at 0.93 there, between its
    // points at 0.3 and 0.6, and its nearest point in recall is 0.3.
    const trace = pr(1, 3);

    expect(trace.moveOnce('UPWARD')).toBe(true);
    expect(at(trace)).toEqual({ curve: 'Logistic', recall: 0.3, precision: 0.95 });
  });

  test('a direction with no curve that way is out of bounds', () => {
    const trace = pr(0, 2);

    expect(trace.isMovable('UPWARD')).toBe(false);
    expect(trace.moveOnce('UPWARD')).toBe(false);
  });
});

describe('a point two curves share sounds as both', () => {
  test('the loosest threshold, where both curves sit at the prevalence, carries both', () => {
    const trace = pr(0, 0);

    trace.moveOnce('DOWNWARD');

    const { intersections } = stateOf(trace);
    expect(intersections?.map(tone => tone.group)).toEqual([0, 1]);
  });
});

describe('the extremes are the best F1, not the ends', () => {
  test('the target is the point with the highest F1 on the current curve', () => {
    const targets = pr(1, 0).getExtremaTargets();
    const best = targets.find(target => target.type === 'max') as ExtremaTarget;
    expect(best.label).toBe('Best F1 at 0.6');
    expect(best.pointIndex).toBe(2);
    expect(best.value).toBe(0.56);
    expect(targets.some(target => target.type === 'min')).toBe(false);
  });

  test('navigating to the target lands on it', () => {
    const trace = pr(0, 0);
    const [best] = trace.getExtremaTargets();
    trace.navigateToExtrema(best);
    expect(stateOf(trace).text.main.value).toBe(0.8);
    expect(stateOf(trace).text.asides?.[0]).toEqual({ label: 'Threshold', value: '0.4' });
  });
});
