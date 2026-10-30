/**
 * The number a violin's curve gives at each point is named for what it is.
 *
 * py-maidr and r-maidr send each point's `width` -- the width the violin is
 * drawn at there -- and no `density`. The announcement called that number
 * "volume", which names nothing on the chart, and the data table called the
 * same number "Density".
 */

import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ViolinKdeTrace } from '@model/violin';
import { TraceType } from '@type/grammar';

/**
 * A one-violin KDE layer.
 * @param curve - The violin's points
 * @returns The layer
 */
function kdeLayer(curve: ViolinKdePoint[]): MaidrLayer {
  return {
    id: 'kde',
    type: TraceType.VIOLIN_KDE,
    axes: { x: { label: 'Cut Quality' }, y: { label: 'Price (USD)' } },
    data: [curve],
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ViolinKdeTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

const BY_WIDTH: ViolinKdePoint[] = [
  { x: 'Premium', y: 326, width: 0.34626145828903687 },
  { x: 'Premium', y: 512.84, width: 0.41672933566782233 },
];

const BY_DENSITY: ViolinKdePoint[] = [
  { x: 'Premium', y: 326, density: 0.00012 },
  { x: 'Premium', y: 512.84, density: 0.00031 },
];

describe('a violin sent as widths', () => {
  test('announces each point\'s width as a width', () => {
    const trace = new ViolinKdeTrace(kdeLayer(BY_WIDTH));
    trace.moveOnce('UPWARD');

    expect(nonEmptyState(trace).text.z).toEqual({ label: 'width', value: '0.3463' });
  });

  test('heads the table\'s column of widths as widths', () => {
    const { dataTable } = new ViolinKdeTrace(kdeLayer(BY_WIDTH)).description;

    expect(dataTable.headers).toEqual(['Cut Quality', 'Price (USD)', 'Width']);
    expect(dataTable.rows[0]).toEqual(['Premium', 326, 0.34626145828903687]);
  });

  test('fills every sampled row of that column with the width', () => {
    // Thirty points are tabled every other one and then the last: the rows
    // in between and the last one read the width of the point they sample.
    const curve: ViolinKdePoint[] = Array.from({ length: 30 }, (_, i) => ({
      x: 'Premium',
      y: 326 + i * 100,
      width: 0.5 - i * 0.01,
    }));

    const { rows } = new ViolinKdeTrace(kdeLayer(curve)).description.dataTable;

    expect(rows[1]).toEqual(['Premium', 526, curve[2].width]);
    expect(rows[rows.length - 1]).toEqual(['Premium', 3226, curve[29].width]);
  });
});

describe('a violin sent as densities', () => {
  test('heads the table\'s column of densities as densities', () => {
    const { dataTable } = new ViolinKdeTrace(kdeLayer(BY_DENSITY)).description;

    expect(dataTable.headers).toEqual(['Cut Quality', 'Price (USD)', 'Density']);
  });
});
