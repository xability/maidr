import type { Context } from '@model/context';
import type { MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { GoToExtremaService } from '@service/goToExtrema';
import { TraceType } from '@type/grammar';

/**
 * The real service over a stub context. `goToExtremeValue` reads only the
 * active plot and its state, so a fuller context would add nothing but the
 * fixtures needed to build one.
 * @param active - The trace the cursor is in
 * @returns The service
 */
function serviceFor(active: unknown): GoToExtremaService {
  const context = {
    get active() {
      return active;
    },
    get state() {
      return (active as { state?: unknown })?.state ?? { type: 'trace', empty: true };
    },
  } as unknown as Context;

  return new GoToExtremaService(context, { toggleFocus: (): void => {} } as never);
}

/**
 * A density curve that peaks at 0.4, as a KDE's is: its tails end at
 * 9.4e-28 on the left and at 0 on the right.
 * @param right - The value at the right end of the tail
 * @returns The layer
 */
function kde(right: number): MaidrLayer {
  return {
    id: 'kde',
    type: TraceType.LINE,
    axes: { x: { label: 'Value' }, y: { label: 'Density' } },
    data: [[
      { x: -6.57, y: 9.4e-28 },
      { x: -3, y: 0.05 },
      { x: 0, y: 0.4 },
      { x: 3, y: 0.05 },
      { x: 6.57, y: right },
    ]],
  };
}

describe('[ and ] read values a billionth of the layer\'s range apart as one extreme', () => {
  test('a KDE curve\'s 9.4e-28 and its 0 are one minimum, walked as two', () => {
    // [ landed on the 0 as though nothing else were at the minimum, though
    // the other tail ends at 9.4e-28, which is drawn, sounded and read the
    // same, and a further press stayed there.
    const trace = TraceFactory.create(kde(0));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
    expect(trace.col).toBe(0);

    expect(service.goToExtremeValue('min')).toEqual({ position: 2, total: 2 });
    expect(trace.col).toBe(4);
  });

  test('values further apart than that keep their order', () => {
    // A millionth of a curve that peaks at 0.4 is still a lower point.
    const trace = TraceFactory.create(kde(4e-7));
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 1 });
    expect(trace.col).toBe(0);
  });

  test('a ridge whose two tails end a hair apart has one lowest density', () => {
    // A ridgeline offers each sample at its own density, so the service has
    // to tie them as the ridge did, or it walks only the exact minimum.
    const trace = TraceFactory.create({
      id: 'ridges',
      type: TraceType.RIDGELINE,
      axes: { x: { label: 'Days' }, y: { label: 'Cohort' } },
      data: [[
        { x: 'early', y: 0, density: 1e-20 },
        { x: 'early', y: 10, density: 0.3 },
        { x: 'early', y: 20, density: 0 },
      ]],
    });
    trace.moveToIndex(0, 1);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
    expect(trace.col).toBe(0);

    expect(service.goToExtremeValue('min')).toEqual({ position: 2, total: 2 });
    expect(trace.col).toBe(2);
  });

  test('two bars of one height computed two ways are both the tallest', () => {
    // 100 / 3 and 1 / 3 * 100 differ in the last bit. Compared exactly, ]
    // offered the first alone and said nothing of the second.
    const trace = TraceFactory.create({
      id: 'shares',
      type: TraceType.BAR,
      axes: { x: { label: 'Party' }, y: { label: 'Share' } },
      data: [
        { x: 'A', y: 100 / 3 },
        { x: 'B', y: (1 / 3) * 100 },
        { x: 'C', y: 10 },
      ],
    });
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 2 });
    expect(service.goToExtremeValue('max')).toEqual({ position: 2, total: 2 });
    expect(trace.col).toBe(1);
  });
});

describe('the service ties what the trace offers within the span the trace tied it in', () => {
  test('a sankey\'s two smallest flows a billionth of its range apart are walked as one minimum', () => {
    // The trace tied 2 and 2.0001 within a billionth of the million its
    // throughputs span, and offered all four nodes, but marked each with a
    // rank value, which the service tied only within a billionth of the
    // value itself: it walked the two nodes of 2 and dropped the other two.
    const trace = TraceFactory.create({
      id: 'flows',
      type: TraceType.SANKEY,
      axes: { x: { label: 'Node' }, y: { label: 'Units' } },
      data: [
        { source: 'Plant', target: 'Grid', value: 1_000_000 },
        { source: 'Roof', target: 'Shed', value: 2 },
        { source: 'Wind', target: 'Pump', value: 2.0001 },
      ],
    });
    const service = serviceFor(trace);

    const jumps = [0, 1, 2, 3].map(() => service.goToExtremeValue('min'));

    expect(jumps).toEqual([1, 2, 3, 4].map(position => ({ position, total: 4 })));
  });

  /**
   * Three candles priced in the billions: the two highest highs one unit
   * apart, and the two widest ranges one unit apart.
   */
  const PRICED_IN_BILLIONS: MaidrLayer = {
    id: 'candles',
    type: TraceType.CANDLESTICK,
    axes: { x: { label: 'Day' }, y: { label: 'Price' } },
    data: [
      { value: 'Mon', open: 1_450_000_000, high: 1_500_000_000, low: 1_440_000_000, close: 1_490_000_000, volume: 1, volatility: 60_000_000 },
      { value: 'Tue', open: 1_460_000_000, high: 1_500_000_001, low: 1_440_000_000, close: 1_470_000_000, volume: 1, volatility: 60_000_001 },
      { value: 'Wed', open: 1_410_000_000, high: 1_420_000_000, low: 1_400_000_000, close: 1_405_000_000, volume: 1, volatility: 20_000_000 },
    ],
  };
  const HIGH = 2;
  const VOLATILITY = 0;

  test('a candlestick\'s highs are compared within the range of its prices', () => {
    // The grid holds the volatilities beside the prices, so its span ran
    // from 20 million to 1.5 billion and tied highs 1.5 apart, where the
    // prices, which are sounded on a register of their own, span 100
    // million and a billionth of it is 0.1.
    const trace = TraceFactory.create(PRICED_IN_BILLIONS);
    trace.moveToIndex(HIGH, 0);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect(trace.col).toBe(1);
  });

  test('a candlestick\'s volatilities are compared within their own range', () => {
    const trace = TraceFactory.create(PRICED_IN_BILLIONS);
    trace.moveToIndex(VOLATILITY, 0);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 1 });
    expect(trace.col).toBe(1);
  });

  test('a box\'s whisker ends are compared within the range its outliers widen', () => {
    // The ends are rows of the box's own grid, so its span is in their
    // units: 1000 here, a billionth of which ties 10 and 10 + 1e-7.
    const trace = TraceFactory.create({
      id: 'boxes',
      type: TraceType.BOX,
      axes: { x: { label: 'Group' }, y: { label: 'Value' } },
      data: [
        { z: 'A', lowerOutliers: [], min: 10, q1: 20, q2: 30, q3: 40, max: 50, upperOutliers: [1010] },
        { z: 'B', lowerOutliers: [], min: 10 + 1e-7, q1: 20, q2: 30, q3: 40, max: 45, upperOutliers: [] },
        { z: 'C', lowerOutliers: [], min: 10.001, q1: 20, q2: 30, q3: 40, max: 45, upperOutliers: [] },
      ],
    });
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
    expect(service.goToExtremeValue('min')).toEqual({ position: 2, total: 2 });
  });

  test('a scatter\'s y values are compared within their own range, not beside its x values', () => {
    // Its grid holds the x values too, and x values a trillion apart would
    // tie a y of 5 with the lowest, 0.
    const day = 86_400_000;
    const trace = TraceFactory.create({
      id: 'readings',
      type: TraceType.SCATTER,
      axes: { x: { label: 'Time' }, y: { label: 'Reading' } },
      data: [
        { x: 1.7e12, y: 0 },
        { x: 1.7e12 + day, y: 1e-9 },
        { x: 1.7e12 + 2 * day, y: 5 },
        { x: 1.7e12 + 3 * day, y: 10 },
      ],
    });
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')).toEqual({ position: 1, total: 2 });
  });

  test('a heat map\'s two cells of one value computed two ways are both the largest', () => {
    // The trace also offers the row's and the column's largest, which are
    // the same cells, so a place is counted once.
    const trace = TraceFactory.create({
      id: 'grid',
      type: TraceType.HEATMAP,
      axes: { x: { label: 'Column' }, y: { label: 'Row' } },
      data: { x: ['a', 'b'], y: ['top', 'bottom'], points: [[1, 100 / 3], [(1 / 3) * 100, 2]] },
    });
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 2 });
    expect(service.goToExtremeValue('max')).toEqual({ position: 2, total: 2 });
  });

  test('a line drawn flat beside one in the millions has one lowest value along it', () => {
    // The margin is the layer's range, which the two lines are drawn and
    // pitched on: on that scale the small line is level, and every point of
    // it is its lowest. Pinned so that a change to a line's own range is
    // made on purpose.
    const trace = TraceFactory.create({
      id: 'lines',
      type: TraceType.LINE,
      axes: { x: { label: 'Year' }, y: { label: 'Amount' } },
      data: [
        [{ x: 1, y: 1e6 }, { x: 2, y: 2e6 }, { x: 3, y: 3e6 }],
        [{ x: 1, y: 0.001 }, { x: 2, y: 0.0015 }, { x: 3, y: 0.002 }],
      ],
    });
    trace.moveToIndex(1, 0);
    const service = serviceFor(trace);

    expect(service.goToExtremeValue('min')?.total).toBe(3);
  });
});
