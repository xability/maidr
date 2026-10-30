import type { AbstractTrace } from '@model/abstract';
import type { VennPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Three sets and their overlaps. Desirable and Feasible are the largest, 10
 * each, and the overlap of all three the smallest, 1.
 */
const FEATURE: VennPoint[] = [
  { sets: ['Desirable'], size: 10 },
  { sets: ['Feasible'], size: 10 },
  { sets: ['Viable'], size: 8 },
  { sets: ['Desirable', 'Feasible'], size: 2.5, label: 'Buildable' },
  { sets: ['Feasible', 'Viable'], size: 2, label: 'Sustainable' },
  { sets: ['Desirable', 'Viable'], size: 2.5, label: 'Marketable' },
  { sets: ['Desirable', 'Feasible', 'Viable'], size: 1, label: 'Ship it' },
];

/**
 * A Venn trace over some regions, as the figure builds one.
 * @param data The regions
 * @returns The trace
 */
function venn(data: VennPoint[] = FEATURE): AbstractTrace {
  return TraceFactory.create({
    id: 'venn',
    type: TraceType.VENN,
    axes: { x: { label: 'Region' }, y: { label: 'Size' } },
    data,
  }) as AbstractTrace;
}

describe('a Venn diagram\'s [ and ] go to its largest and smallest region', () => {
  test('offers sets and overlaps alike, by the sizes the diagram declares', () => {
    const trace = venn();

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(trace.getExtremaTargets().map(target => [target.type, target.label, target.value])).toEqual([
      ['max', 'Max point at Desirable', 10],
      ['max', 'Max point at Feasible', 10],
      ['min', 'Min point at Desirable, Feasible and Viable', 1],
    ]);
  });

  test('lands on the region', () => {
    const trace = venn();
    const smallest = trace.getExtremaTargets().find(target => target.type === 'min');
    if (smallest === undefined) {
      throw new Error('Expected a smallest region');
    }

    trace.navigateToExtrema(smallest);
    const { text } = trace.state as NonEmptyTraceState;

    expect(text.main.value).toBe('Desirable, Feasible and Viable');
  });

  test('offers nothing on a diagram drawn for its membership alone', () => {
    const unsized: VennPoint[] = [
      { sets: ['A'] },
      { sets: ['B'] },
      { sets: ['A', 'B'] },
    ];

    expect(venn(unsized).getExtremaTargets()).toEqual([]);
  });
});
