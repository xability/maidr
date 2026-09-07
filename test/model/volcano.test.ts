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
  thresholds: {
    significance?: number;
    effect?: number;
    significanceDirection?: 'above' | 'below';
  } | null = { significance: 5, effect: 2 },
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
  thresholds: {
    significance?: number;
    effect?: number;
    significanceDirection?: 'above' | 'below';
  } | null = { significance: 5, effect: 2 },
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
  test('counts the points clearing the threshold, first', () => {
    // "43 of 12,000" is the first thing a sighted reader takes from the
    // shape of the cloud, and the last thing a per-point walk would ever
    // assemble. UP1, DOWN1 and UP2 clear both cutoffs.
    expect(stat(volcano(), 'Points clearing the threshold')).toBe('3 of 8');
    expect(volcano().description.stats[0].label)
      .toBe('Points clearing the threshold');
  });

  test('says where the line it counted against actually sits', () => {
    // -log10(p) at 1.3, -log10(p) at 7.3 and raw p at 0.05 are three
    // different cutoffs, and a count with none of them named cannot be told
    // apart from noise. A sighted reader has the dashed line and the axis.
    expect(stat(volcano(), 'Significance threshold'))
      .toBe('Minus log10 p at or above 5');
    expect(stat(volcano(), 'Effect threshold'))
      .toBe('Log2 fold change of magnitude 2 or more');
  });

  test('names the direction the layer declared, not one of them', () => {
    const raw = volcano(GENES, { significance: 0.05, significanceDirection: 'below' });

    expect(stat(raw, 'Significance threshold'))
      .toBe('Minus log10 p at or below 0.05');
  });

  test('names them, because identity is the payload', () => {
    expect(stat(volcano(), 'Clearing the threshold, named'))
      .toBe('UP1, DOWN1, UP2');
  });

  test('a large effect in the negative direction is still a finding', () => {
    // A reading that only looked rightwards would drop DOWN1 and report two.
    expect(String(stat(volcano(), 'Clearing the threshold, named')))
      .toContain('DOWN1');
  });

  test('both thresholds have to be cleared, not either', () => {
    // LOUD is significant with a small effect; BIG has a large effect and no
    // significance. Taking either cutoff alone names the wrong set.
    const named = String(stat(volcano(), 'Clearing the threshold, named'));

    expect(named).toBe('UP1, DOWN1, UP2');
    expect(named).not.toContain('LOUD');
    expect(named).not.toContain('BIG');
  });

  test('claims nothing when the layer declares no threshold', () => {
    // These charts sit on transformed axes whose conventions differ by field
    // and by tool. A guessed line sorts every point onto the wrong side of
    // it, silently.
    const plain = volcano(GENES, null);

    expect(stat(plain, 'Points clearing the threshold')).toBeUndefined();
    expect(stat(plain, 'Significance threshold')).toBeUndefined();
    expect(stat(plain, 'Effect threshold')).toBeUndefined();
  });

  test('reports none rather than staying silent when nothing clears', () => {
    // "Nothing reached significance" is a real reading of the chart.
    const quiet = volcano(GENES, { significance: 50 });

    expect(stat(quiet, 'Points clearing the threshold')).toBe('0 of 8');
  });

  test('says nothing about how the two axes correlate', () => {
    // A volcano is symmetric about x = 0 by construction, so the scatter's
    // Pearson r is near zero whatever the chart shows -- and on a Manhattan
    // it correlates a p value with a genomic coordinate. Either way the
    // dialog would state a linear relationship neither chart was drawn for.
    expect(volcano().description.stats.map(entry => entry.label))
      .not
      .toContain('Correlation');
  });

  test('counts the regions when the layer names them', () => {
    const chromosomes: VolcanoPoint[] = [
      { x: 1, y: 8, label: 'rs1', group: 'chr1' },
      { x: 2, y: 9, label: 'rs2', group: 'chr1' },
      { x: 3, y: 7, label: 'rs3', group: 'chr2' },
    ];

    expect(stat(volcano(chromosomes), 'Regions')).toBe(2);
  });

  test('names the regions the hits are actually in', () => {
    // "Regions: 22" is the number of chromosomes in a genome, which is not a
    // question anybody brought to the chart. Where the hits fell, and how
    // many in each, is the second question every Manhattan is read for.
    const chromosomes: VolcanoPoint[] = [
      { x: 3, y: 8, label: 'rs1', group: 'chr1' },
      { x: 4, y: 9, label: 'rs2', group: 'chr1' },
      { x: 3, y: 7, label: 'rs3', group: 'chr2' },
      { x: 0.1, y: 9, label: 'rs4', group: 'chr9' },
    ];

    // rs4 is significant and has no effect, so chr9 has no hit to report.
    expect(stat(volcano(chromosomes), 'Regions with hits'))
      .toBe('chr1 (2), chr2 (1)');
  });

  test('says nothing about regions on a plain volcano', () => {
    expect(stat(volcano(), 'Regions')).toBeUndefined();
    expect(stat(volcano(), 'Regions with hits')).toBeUndefined();
  });
});

describe('a raw p axis runs the other way', () => {
  /**
   * The same four genes on an untransformed p axis: small p is the finding.
   *
   * `HIT1` and `HIT2` reach p <= 0.05; `MISS1` and `MISS2` do not. Fixed to
   * "above", a reading selects MISS1 and MISS2 and announces them as the
   * result -- not a degraded reading but the exact inverse of one.
   */
  const RAW_P: VolcanoPoint[] = [
    { x: 3.4, y: 0.001, label: 'HIT1' },
    { x: -3.1, y: 0.04, label: 'HIT2' },
    { x: 2.8, y: 0.4, label: 'MISS1' },
    { x: -2.6, y: 0.9, label: 'MISS2' },
  ];

  test('selects the small p values when the layer says below', () => {
    const trace = volcano(RAW_P, {
      significance: 0.05,
      effect: 2,
      significanceDirection: 'below',
    });
    const read = (label: string): unknown =>
      trace.description.stats.find(entry => entry.label === label)?.value;

    // HIT1 first: on a raw p axis the strongest finding is the smallest
    // number, so the reading order the rotor walks -- y descending -- is
    // weakest-first here and naming the hits in it inverts the ranking.
    expect(read('Points clearing the threshold')).toBe('2 of 4');
    expect(read('Clearing the threshold, named')).toBe('HIT1, HIT2');
  });

  test('the capped list keeps the strongest hits, not the ten nearest the line', () => {
    // Twelve hits, so the list is cut at ten. Cut in reading order it would
    // keep the ten weakest and drop p = 0.001 and p = 0.002 -- under a label
    // that says the opposite, so nothing in the announcement contradicts it.
    const many: VolcanoPoint[] = Array.from({ length: 12 }, (_, index) => ({
      x: 3,
      y: (index + 1) / 1000,
      label: `HIT${index + 1}`,
    }));
    const trace = volcano(many, {
      significance: 0.05,
      effect: 2,
      significanceDirection: 'below',
    });
    const named = String(trace.description.stats
      .find(entry => entry.label === 'Top 10 by significance')
      ?.value);

    expect(named.startsWith('HIT1, HIT2, HIT3')).toBe(true);
    expect(named).not.toContain('HIT12');
  });

  test('selects the wrong half when the direction is left at the default', () => {
    // Pinned deliberately: this is what the chart does when a producer on a
    // raw p axis forgets to declare the direction, and it is why the field
    // exists rather than being assumed.
    const trace = volcano(RAW_P, { significance: 0.05, effect: 2 });

    expect(trace.description.stats
      .find(entry => entry.label === 'Clearing the threshold, named')
      ?.value)
      .toBe('MISS2, MISS1');
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

    // Neither "above" nor "below": on a raw p axis a point clears the cutoff
    // by sitting under it, and the word for one of those charts is the
    // inverse of the reading on the other.
    expect(nonEmptyState(trace).text.asides).toEqual([
      { label: 'Name', value: 'UP1' },
      { label: 'Threshold', value: 'cleared' },
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
      { label: 'Threshold', value: 'cleared' },
    ]);
  });

  test('names the point where a column holds exactly one', () => {
    // Every gene in the fixture has its own x, so a column IS one point and
    // the cursor identifies it. This used to withhold the name here, on a
    // rule about stacks that this fixture never forms -- the name now comes
    // from the scatter, which owns `label` since #1106.
    expect(nonEmptyState(volcano()).text.asides).toEqual([
      { label: 'Name', value: 'DOWN1' },
    ]);
  });

  test('says nothing extra where the cursor is on more than one point', () => {
    // Two genes at one x. Now the column mode cursor sits on a stack, and
    // naming either of them would name the wrong one -- which is the case
    // the rule was always about.
    const stacked: VolcanoPoint[] = [
      { x: 1, y: 8, label: 'rs1' },
      { x: 1, y: 9, label: 'rs2' },
    ];
    expect(nonEmptyState(volcano(stacked)).text.asides).toBeUndefined();
  });
});
