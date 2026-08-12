import type { MaidrLayer, VolcanoPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { VolcanoTrace } from '@model/volcano';
import { TraceType } from '@type/grammar';

/**
 * Eight genes, of which three clear both thresholds.
 *
 * The fixture is built so that a reading which only looked rightwards on the
 * effect axis would drop `DOWN1` -- a fold change of -3.1 is as large an
 * effect as one of +3.1, and a volcano is drawn symmetric precisely because
 * both directions are findings.
 *
 * `LOUD` clears significance but not effect, and `BIG` clears effect but not
 * significance, so a reading that took either threshold alone would name the
 * wrong set.
 */
const GENES: VolcanoPoint[] = [
  { x: 0.2, y: 0.5, label: 'QUIET' },
  { x: 3.4, y: 9.1, label: 'UP1' },
  { x: -3.1, y: 7.7, label: 'DOWN1' },
  { x: 0.4, y: 8.8, label: 'LOUD' },
  { x: 4.9, y: 0.9, label: 'BIG' },
  { x: 2.6, y: 6.2, label: 'UP2' },
  { x: -0.7, y: 1.1, label: 'QUIET2' },
  { x: 1.2, y: 2.0, label: 'QUIET3' },
];

/**
 * Create a minimal volcano layer for model-only tests.
 * @param data The points the layer carries
 * @param thresholds The cutoffs, when declared
 * @returns Volcano layer definition
 */
function createLayer(
  data: VolcanoPoint[] = GENES,
  thresholds: { significance?: number; effect?: number } | null = {
    significance: 5,
    effect: 2,
  },
): MaidrLayer {
  return {
    id: 'test-volcano-layer',
    type: TraceType.VOLCANO,
    title: 'Differential expression',
    axes: { x: { label: 'Log2 fold change' }, y: { label: 'Minus log10 p' } },
    data,
    ...(thresholds === null ? {} : { thresholdOptions: thresholds }),
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: VolcanoTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a volcano trace.
 * @param data The points the layer carries
 * @param thresholds The cutoffs, when declared
 * @returns The trace
 */
function volcano(
  data: VolcanoPoint[] = GENES,
  thresholds: { significance?: number; effect?: number } | null = {
    significance: 5,
    effect: 2,
  },
): VolcanoTrace {
  return TraceFactory.create(createLayer(data, thresholds)) as VolcanoTrace;
}

/**
 * Read a description stat by label.
 * @param trace The trace to read
 * @param label The stat to find
 * @returns Its value, or undefined
 */
function stat(trace: VolcanoTrace, label: string): unknown {
  return trace.description.stats.find(entry => entry.label === label)?.value;
}

describe('volcano registration', () => {
  test('the factory builds a VolcanoTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(VolcanoTrace);
  });

  test('a Manhattan layer builds the same trace', () => {
    // They differ in what the x axis means and in nothing a reader
    // navigates, the way POLAR_AREA and RADAR share RadarTrace.
    const manhattan = TraceFactory.create({
      ...createLayer(),
      type: TraceType.MANHATTAN,
    });

    expect(manhattan).toBeInstanceOf(VolcanoTrace);
  });

  test('it names itself rather than falling back to scatter', () => {
    expect(volcano().description.chartType).toBe('Volcano Plot');
  });
});

describe('the summary is what the chart is read for', () => {
  test('counts the points above the threshold, first', () => {
    // "43 of 12,000" is the first thing a sighted reader takes from the
    // shape of the cloud, and the last thing a per-point walk would ever
    // assemble. UP1, DOWN1 and UP2 clear both cutoffs.
    expect(stat(volcano(), 'Above the threshold')).toBe('3 of 8');
    expect(volcano().description.stats[0].label).toBe('Above the threshold');
  });

  test('names them, because identity is the payload', () => {
    expect(stat(volcano(), 'Above the threshold, named'))
      .toBe('UP1, DOWN1, UP2');
  });

  test('a large effect in the negative direction is still a finding', () => {
    // A reading that only looked rightwards would drop DOWN1 and report two.
    expect(String(stat(volcano(), 'Above the threshold, named')))
      .toContain('DOWN1');
  });

  test('both thresholds have to be cleared, not either', () => {
    // LOUD is significant with a small effect; BIG has a large effect and no
    // significance. Taking either cutoff alone names the wrong set.
    const named = String(stat(volcano(), 'Above the threshold, named'));

    expect(named).not.toContain('LOUD');
    expect(named).not.toContain('BIG');
  });

  test('claims nothing when the layer declares no threshold', () => {
    // These charts sit on transformed axes whose conventions differ by field
    // and by tool. A guessed line sorts every point onto the wrong side of
    // it, silently.
    expect(stat(volcano(GENES, null), 'Above the threshold')).toBeUndefined();
  });

  test('reports none rather than staying silent when nothing clears', () => {
    // "Nothing reached significance" is a real reading of the chart.
    const quiet = volcano(GENES, { significance: 50 });

    expect(stat(quiet, 'Above the threshold')).toBe('0 of 8');
  });

  test('counts the regions when the layer names them', () => {
    const chromosomes: VolcanoPoint[] = [
      { x: 1, y: 8, label: 'rs1', group: 'chr1' },
      { x: 2, y: 9, label: 'rs2', group: 'chr1' },
      { x: 3, y: 7, label: 'rs3', group: 'chr2' },
    ];

    expect(stat(volcano(chromosomes), 'Regions')).toBe(2);
  });

  test('says nothing about regions on a plain volcano', () => {
    expect(stat(volcano(), 'Regions')).toBeUndefined();
  });
});

describe('the rotor reaches the points that matter', () => {
  test('offers the filter when something clears the threshold', () => {
    expect(volcano().getRotorFilterUnits().map(unit => unit.key))
      .toContain('significant');
  });

  test('withholds it when nothing does', () => {
    // A mode whose only possible answer is "none found" is worse than not
    // offering it, and the description already says so in words.
    expect(volcano(GENES, { significance: 50 }).getRotorFilterUnits()
      .map(unit => unit.key)).not.toContain('significant');
  });

  test('withholds it when no threshold is declared', () => {
    expect(volcano(GENES, null).getRotorFilterUnits().map(unit => unit.key))
      .not
      .toContain('significant');
  });

  test('walks only the significant points', () => {
    const trace = volcano();

    expect(trace.moveToRotorFilter('significant', 'right')).toBe(true);
    const first = nonEmptyState(trace).text.asides?.find(aside => aside.label === 'Name')?.value;

    expect(trace.moveToRotorFilter('significant', 'right')).toBe(true);
    const second = nonEmptyState(trace).text.asides?.find(aside => aside.label === 'Name')?.value;

    // Reading order is y descending, so UP1 (9.1) precedes DOWN1 (7.7).
    expect(first).toBe('UP1');
    expect(second).toBe('DOWN1');
  });

  test('reports the bound rather than wrapping', () => {
    const trace = volcano();
    trace.moveToRotorFilter('significant', 'right');
    trace.moveToRotorFilter('significant', 'right');
    trace.moveToRotorFilter('significant', 'right');

    expect(trace.moveToRotorFilter('significant', 'right')).toBe(false);
  });
});

describe('the announcement names the point', () => {
  test('carries the name and which side of the line it is on', () => {
    const trace = volcano();
    trace.moveToRotorFilter('significant', 'right');

    expect(nonEmptyState(trace).text.asides).toEqual([
      { label: 'Name', value: 'UP1' },
      { label: 'Threshold', value: 'above' },
    ]);
  });

  test('carries the region on a Manhattan layer', () => {
    const chromosomes: VolcanoPoint[] = [
      { x: 1, y: 8, label: 'rs1', group: 'chr1' },
      { x: 2, y: 9, label: 'rs2', group: 'chr7' },
    ];
    const trace = volcano(chromosomes);
    trace.moveToRotorFilter('significant', 'right');

    expect(nonEmptyState(trace).text.asides).toEqual([
      { label: 'Name', value: 'rs2' },
      { label: 'Region', value: 'chr7' },
      { label: 'Threshold', value: 'above' },
    ]);
  });

  test('says nothing extra where the cursor is not on one point', () => {
    // The scatter's column mode sits on a whole stack at once, and naming
    // any of them there would name the wrong one.
    expect(nonEmptyState(volcano()).text.asides).toBeUndefined();
  });
});
