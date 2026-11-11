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
