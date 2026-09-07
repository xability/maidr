import type { ScatterTrace } from '@model/scatter';
import type { MaidrLayer, ScatterPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * What a sighted reader takes from a scatter cloud before any individual
 * point: whether it tilts up, tilts down, or does not tilt. A reader who walks
 * 150 points one at a time has heard 150 numbers and has still not been told
 * the relationship they were plotted to show.
 */

/**
 * Build a scatter trace with no selectors, so it needs no DOM.
 * @param data The points the layer carries
 * @param type Which trace type to build (sunflower routes here too)
 * @returns The trace
 */
function traceOf(data: ScatterPoint[], type = TraceType.SCATTER): ScatterTrace {
  const layer: MaidrLayer = {
    id: 'points',
    type,
    title: 'Observations',
    axes: { x: { label: 'Horsepower' }, y: { label: 'Miles per gallon' } },
    data,
  };
  return TraceFactory.create(layer) as ScatterTrace;
}

/**
 * Read one stat out of a trace's description.
 * @param trace The trace to read
 * @param label Which stat to take
 * @returns The stat's value, or undefined when it is not reported
 */
function statOf(trace: ScatterTrace, label: string): unknown {
  return trace.description.stats.find(stat => stat.label === label)?.value;
}

/** A rising cloud with a little scatter in it. */
const RISING: ScatterPoint[] = [
  { x: 1, y: 2 },
  { x: 2, y: 4 },
  { x: 3, y: 5 },
  { x: 4, y: 8 },
  { x: 5, y: 9 },
];

describe('a scatter says which way its cloud tilts', () => {
  test('names the direction and the strength, with the coefficient behind it', () => {
    expect(statOf(traceOf(RISING), 'Correlation')).toBe('very strong positive (r = 0.99, n = 5)');
  });

  test('reads a falling cloud as negative', () => {
    const falling = RISING.map(point => ({ x: point.x, y: -point.y }));

    expect(String(statOf(traceOf(falling), 'Correlation'))).toContain('negative');
  });

  test('claims no direction at all when the tilt is noise', () => {
    // A symmetric V: plainly a relationship, and its *linear* correlation is
    // exactly zero. "none" is the right word for the claim the label makes,
    // and the sign of a near-zero r flips when one point moves, so a direction
    // would tell a reader the cloud tilts when it does not.
    const symmetric: ScatterPoint[] = [
      { x: 1, y: 5 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
      { x: 4, y: 2 },
      { x: 5, y: 5 },
    ];
    const value = String(statOf(traceOf(symmetric), 'Correlation'));

    expect(value).toContain('none');
    expect(value).not.toContain('positive');
    expect(value).not.toContain('negative');
  });

  test('reports the coefficient rounded, not to sixteen digits', () => {
    expect(String(statOf(traceOf(RISING), 'Correlation'))).toMatch(/r = -?\d+(\.\d{1,2})?,/);
  });

  test('makes no claim about a categorical axis', () => {
    // The numbers on a named axis are slots the producer chose, so a
    // coefficient over them would describe that ordering while sounding like a
    // statement about the data.
    const strip: ScatterPoint[] = [
      { x: 0, xLabel: 'a', y: 1 },
      { x: 1, xLabel: 'b', y: 5 },
      { x: 2, xLabel: 'c', y: 9 },
      { x: 2, xLabel: 'c', y: 4 },
    ];

    expect(statOf(traceOf(strip), 'Correlation')).toBeUndefined();
  });

  test('makes no claim when an axis never moves', () => {
    const rug: ScatterPoint[] = [
      { x: 1.5, y: 0 },
      { x: 2.5, y: 0 },
      { x: 3.5, y: 0 },
    ];

    expect(statOf(traceOf(rug), 'Correlation')).toBeUndefined();
  });

  test('makes no claim from two points, which always lie on a line', () => {
    expect(statOf(traceOf([{ x: 1, y: 3 }, { x: 2, y: 9 }]), 'Correlation')).toBeUndefined();
  });

  test('counts only the pairs it could use', () => {
    const withGap: ScatterPoint[] = [
      ...RISING,
      { x: 6, y: Number.NaN as unknown as number },
    ];

    expect(String(statOf(traceOf(withGap), 'Correlation'))).toContain('n = 5');
  });
});

describe('a scatter names its axes the way its table does', () => {
  test('labels the range stats after the authored axis, not after X and Y', () => {
    const trace = traceOf(RISING);

    expect(statOf(trace, 'Horsepower range')).toBe('1 to 5');
    expect(statOf(trace, 'Miles per gallon range')).toBe('2 to 9');
    expect(statOf(trace, 'X range')).toBeUndefined();
  });

  test('names the categories of a named axis rather than spanning its slots', () => {
    // "X range: 0 to 2" for categories a, b, c was a slot index announced as
    // though it were a measurement, contradicted by the table two lines below.
    const strip: ScatterPoint[] = [
      { x: 0, xLabel: 'a', y: 1 },
      { x: 1, xLabel: 'b', y: 5 },
      { x: 2, xLabel: 'c', y: 9 },
    ];
    const trace = traceOf(strip);

    expect(statOf(trace, 'Horsepower categories')).toBe('a, b, c');
    expect(statOf(trace, 'Horsepower range')).toBeUndefined();
  });

  test('says an empty layer has no extent rather than printing an infinity', () => {
    const trace = traceOf([]);

    expect(statOf(trace, 'Horsepower range')).toBe('missing');
  });

  test('says how deep the deepest column is, but only where points stack', () => {
    const stacked: ScatterPoint[] = [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 4 },
    ];

    expect(statOf(traceOf(stacked), 'Most points at one Horsepower')).toBe(3);
    expect(statOf(traceOf(RISING), 'Most points at one Horsepower')).toBeUndefined();
  });
});

describe('a scatter that carries a third value', () => {
  test('keeps it, rather than reading a sunflower as a plain point cloud', () => {
    // TraceType.SUNFLOWER routes here precisely so the multiplicity count
    // survives; the description used to give four rows of (x, y) for eight
    // observations and no count anywhere.
    const sunflower: ScatterPoint[] = [
      { x: 1, y: 1, z: 3 },
      { x: 2, y: 2, z: 1 },
      { x: 3, y: 3, z: 4 },
    ];
    const layer: MaidrLayer = {
      id: 'sunflower',
      type: TraceType.SUNFLOWER,
      axes: {
        x: { label: 'Horsepower' },
        y: { label: 'Miles per gallon' },
        z: { label: 'Observations' },
      },
      data: sunflower,
    };
    const trace = TraceFactory.create(layer) as ScatterTrace;

    expect(trace.description.dataTable.headers).toEqual([
      'Horsepower',
      'Miles per gallon',
      'Observations',
    ]);
    expect(trace.description.dataTable.rows[0]).toEqual([1, 1, 3]);
    expect(statOf(trace, 'Observations range')).toBe('1 to 4');
  });
});

describe('a scatter says where its cloud sits, not only which way it tilts', () => {
  /** Twelve points on a rising diagonal, plus four bunched at the low end. */
  const LOWER_LEFT: ScatterPoint[] = [
    ...Array.from({ length: 12 }, (_, i) => ({ x: i, y: i })),
    { x: 1, y: 2 },
    { x: 2, y: 1 },
    { x: 0, y: 3 },
    { x: 3, y: 0 },
  ];

  test('names the quarter of the chart holding most of the points', () => {
    // The fact `r` cannot carry: an r of 0.95 is the same number whether the
    // cloud sits low and left or high and right.
    expect(statOf(traceOf(LOWER_LEFT), 'Most points')).toBe('62% in the lower left (quadrant 3)');
  });

  test('breaks the four shares out behind the headline', () => {
    expect(statOf(traceOf(LOWER_LEFT), 'Points by quadrant'))
      .toBe('1 upper right 38%, 2 upper left 0%, 3 lower left 62%, 4 lower right 0%');
  });

  test('says where it drew the dividing lines', () => {
    // Never left to be guessed at: the rule changes with the data, so the
    // values are reported either way.
    expect(statOf(traceOf(LOWER_LEFT), 'Quadrants split at')).toBe('Horsepower 5.5, Miles per gallon 5.5');
  });

  test('the shares add up to a hundred, because a reader adds them', () => {
    // Rounded together rather than one at a time. Four independent roundings
    // land off 100 routinely, and a reader who sums them to 101 has no way to
    // see that the extra point is rounding.
    const shares = String(statOf(traceOf(LOWER_LEFT), 'Points by quadrant'))
      .split(', ')
      .map(part => Number(part.replace(/\D+$/, '').match(/(\d+)$/)?.[1]));

    expect(shares.reduce((sum, share) => sum + (share ?? 0), 0)).toBe(100);
  });

  test('cuts at the origin when the axes actually cross it', () => {
    // What a sighted reader sees, and what "quadrant" means everywhere else.
    const crossing: ScatterPoint[] = [
      { x: -5, y: 5 },
      { x: -4, y: 4 },
      { x: -3, y: 6 },
      { x: -2, y: 3 },
      { x: 5, y: -5 },
      { x: 4, y: -4 },
      { x: 3, y: -6 },
      { x: 2, y: -3 },
      { x: 1, y: 1 },
      { x: -1, y: -1 },
    ];
    const trace = traceOf(crossing);

    expect(statOf(trace, 'Quadrants split at')).toBe('Horsepower 0, Miles per gallon 0');
    expect(statOf(trace, 'Most points'))
      .toBe('40% in the upper left (quadrant 2) and the lower right (quadrant 4)');
  });

  test('cuts at the middle of the extent when they do not', () => {
    // Most scatters hold no negative value at all, so origin quadrants would
    // put every point in the first and say nothing.
    expect(statOf(traceOf(LOWER_LEFT), 'Quadrants split at')).toBe('Horsepower 5.5, Miles per gallon 5.5');
  });

  test('declines to name a densest quarter when the cloud is evenly spread', () => {
    // A "densest" quadrant holding 26% against another's 25% would report the
    // shape of the sample rather than the shape of the data.
    const even: ScatterPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 10 },
      { x: 1, y: 9 },
      { x: 10, y: 0 },
      { x: 9, y: 1 },
      { x: 10, y: 10 },
      { x: 9, y: 9 },
    ];

    expect(statOf(traceOf(even), 'Most points')).toBe('spread evenly across the four quadrants');
  });

  test('makes no claim about a categorical axis', () => {
    // The horizontal split would fall between two categories the producer
    // happened to order that way, and "62% on the left" would be a fact about
    // that ordering.
    const strip: ScatterPoint[] = Array.from({ length: 10 }, (_, i) => ({
      x: i % 3,
      xLabel: ['a', 'b', 'c'][i % 3],
      y: i,
    }));
    const trace = traceOf(strip);

    expect(statOf(trace, 'Most points')).toBeUndefined();
    expect(statOf(trace, 'Points by quadrant')).toBeUndefined();
  });

  test('makes no claim when an axis never moves', () => {
    const rug: ScatterPoint[] = Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0 }));

    expect(statOf(traceOf(rug), 'Most points')).toBeUndefined();
  });

  test('makes no claim from a handful of points', () => {
    // Four shares of four points are four statements about one point each,
    // dressed up as percentages.
    const few: ScatterPoint[] = [
      { x: 1, y: 1 },
      { x: 2, y: 5 },
      { x: 5, y: 2 },
      { x: 6, y: 6 },
    ];

    expect(statOf(traceOf(few), 'Most points')).toBeUndefined();
  });

  test('puts the headline with the correlation and the breakdown behind the counts', () => {
    // One line of shape up front; the four percentages and the dividing values
    // would bury the counts if they sat beside it.
    const labels = traceOf(LOWER_LEFT).description.stats.map(stat => stat.label);

    expect(labels.indexOf('Most points')).toBe(labels.indexOf('Correlation') + 1);
    expect(labels.indexOf('Points by quadrant')).toBeGreaterThan(labels.indexOf('Total points'));
    expect(labels.indexOf('Quadrants split at')).toBe(labels.indexOf('Points by quadrant') + 1);
  });
});
