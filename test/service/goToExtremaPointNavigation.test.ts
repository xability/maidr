import type { Context } from '@model/context';
import type { ScatterTrace } from '@model/scatter';
import type { ScatterPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
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

describe('a scatter plot in point navigation walks the points tied at its highest y', () => {
  test('a further ] goes to the next point holding the highest y', () => {
    // Read by row and column, the service never found the cursor on a tied
    // point, whose index point navigation keeps elsewhere, so a further
    // press stayed on the first.
    const points: ScatterPoint[] = [
      { x: 1, y: 4 },
      { x: 2, y: 9 },
      { x: 3, y: 9 },
      { x: 4, y: 1 },
    ];
    const trace = TraceFactory.create({
      id: 'points',
      type: TraceType.SCATTER,
      axes: { x: { label: 'X' }, y: { label: 'Y' } },
      data: points,
    }) as ScatterTrace;
    trace.setPointMode(true);
    const service = serviceFor(trace);
    const x = (): unknown => (trace.state as NonEmptyTraceState).text.main.value;

    expect(service.goToExtremeValue('max')).toEqual({ position: 1, total: 2 });
    expect(x()).toBe(2);

    expect(service.goToExtremeValue('max')).toEqual({ position: 2, total: 2 });
    expect(x()).toBe(3);
  });
});
