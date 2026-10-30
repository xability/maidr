import type { AbstractTrace } from '@model/abstract';
import type { HexbinPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * A staggered lattice. The bin at (3, 1) holds the most points, 12, and the
 * one at (4, 0) the fewest of the occupied ones, 1; the bin at (0, 2) holds
 * none.
 */
const LATTICE: HexbinPoint[][] = [
  [
    { x: 0, y: 0, count: 3 },
    { x: 2, y: 0, count: 9 },
    { x: 4, y: 0, count: 1 },
  ],
  [
    { x: 1, y: 1, count: 5 },
    { x: 3, y: 1, count: 12 },
  ],
  [
    { x: 0, y: 2, count: 0 },
    { x: 2, y: 2, count: 7 },
    { x: 4, y: 2, count: 2 },
  ],
];

/**
 * A hexbin trace over a lattice, as the figure builds one.
 * @param data The lattice
 * @returns The trace
 */
function hexbin(data: HexbinPoint[][] = LATTICE): AbstractTrace {
  return TraceFactory.create({
    id: 'bins',
    type: TraceType.HEXBIN,
    axes: { x: { label: 'Height' }, y: { label: 'Weight' } },
    data,
  }) as AbstractTrace;
}

describe('a hexbin\'s [ and ] go to its densest and its sparsest occupied bin', () => {
  test('offers the bins holding the most and the fewest points, never an empty one', () => {
    // The description's `Min count` is taken over the occupied bins, and a
    // bin with no point in it is no sparse part of the cloud.
    const trace = hexbin();

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(trace.getExtremaTargets().map(target => [target.type, target.label, target.value])).toEqual([
      ['max', 'Max point at 3, 1', 12],
      ['min', 'Min point at 4, 0', 1],
    ]);
  });

  test('lands on the bin, as an announcement of it reads', () => {
    const trace = hexbin();
    const densest = trace.getExtremaTargets().find(target => target.type === 'max');
    if (densest === undefined) {
      throw new Error('Expected a densest bin');
    }

    trace.navigateToExtrema(densest);
    const { text } = trace.state as NonEmptyTraceState;

    expect([text.main.value, text.cross?.value, text.z?.value]).toEqual([3, 1, 12]);
  });

  test('offers every bin holding the most points, so a tie is walked', () => {
    const tied = LATTICE.map(row => row.map(bin => (bin.count === 9 ? { ...bin, count: 12 } : bin)));
    const densest = hexbin(tied).getExtremaTargets().filter(target => target.type === 'max');

    expect(densest.map(target => target.label)).toEqual(['Max point at 2, 0', 'Max point at 3, 1']);
  });
});
