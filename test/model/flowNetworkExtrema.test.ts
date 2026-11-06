import type { AbstractTrace } from '@model/abstract';
import type { ExtremaTarget } from '@type/extrema';
import type { FlowPoint, MaidrLayer, NetworkPoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * An energy sankey. Coal's 56 is the most that passes through any node and
 * the Losses' 8 the least.
 */
const ENERGY: FlowPoint[] = [
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Gas', target: 'Electricity', value: 12 },
  { source: 'Gas', target: 'Heat', value: 6 },
  { source: 'Electricity', target: 'Homes', value: 30 },
  { source: 'Electricity', target: 'Industry', value: 16 },
  { source: 'Heat', target: 'Homes', value: 20 },
];

/**
 * A collaboration network. Ada has four links; Ida only one to herself,
 * which counts as none.
 */
const COLLAB: NetworkPoint[] = [
  { source: 'Edsger', target: 'Ada' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Barbara', target: 'Ada' },
  { source: 'Tim', target: 'Vint' },
  { source: 'Ida', target: 'Ida' },
];

/**
 * Build a trace from a layer, as the figure does.
 * @param type The layer type
 * @param data What it carries
 * @returns The trace
 */
function traceOf(type: TraceType, data: FlowPoint[] | NetworkPoint[]): AbstractTrace {
  const layer: MaidrLayer = {
    id: 'graph',
    type,
    axes: { x: { label: 'Node' }, y: { label: 'Amount' } },
    data,
  };
  return TraceFactory.create(layer) as AbstractTrace;
}

/**
 * The targets as type, label and value, as the Go To dialog lists them.
 * @param trace The trace to read
 * @returns One triple per target
 */
function offered(trace: AbstractTrace): [string, string, number][] {
  return trace.getExtremaTargets().map(target => [target.type, target.label, target.value]);
}

/**
 * The node a target puts the reader on, as the announcement reads it.
 * @param trace The trace to move
 * @param target The target to go to
 * @returns The node and its value
 */
function landing(trace: AbstractTrace, target: ExtremaTarget | undefined): unknown[] {
  if (target === undefined) {
    throw new Error('Expected a target');
  }
  trace.navigateToExtrema(target);
  const state = trace.state as NonEmptyTraceState;
  return [state.text.main.value, state.text.cross?.value];
}

describe('a flow chart\'s [ and ] go to its busiest and quietest node', () => {
  test.each([TraceType.SANKEY, TraceType.ALLUVIAL, TraceType.CHORD])(
    'offers the node the most passes through, and the one the least passes through, on a %s',
    (type) => {
      const trace = traceOf(type, ENERGY);

      expect(trace.supportsExtremaNavigation()).toBe(true);
      expect(offered(trace)).toEqual([
        ['max', 'Max point at Coal', 56],
        ['min', 'Min point at Losses', 8],
      ]);
    },
  );

  test('lands on the node, as an announcement of it reads', () => {
    const trace = traceOf(TraceType.SANKEY, ENERGY);
    const [busiest, quietest] = trace.getExtremaTargets();

    expect(landing(trace, busiest)).toEqual(['Coal', 56]);
    expect(landing(trace, quietest)).toEqual(['Losses', 8]);
  });

  test('ties throughputs that are equal but for float noise', () => {
    // A passes 0.1 + 0.2, which adds up to 0.30000000000000004, and B and Z
    // pass 0.3. Compared exactly, ] offered A alone.
    const noisy: FlowPoint[] = [
      { source: 'A', target: 'X', value: 0.1 },
      { source: 'A', target: 'Y', value: 0.2 },
      { source: 'B', target: 'Z', value: 0.3 },
    ];
    const busiest = offered(traceOf(TraceType.SANKEY, noisy))
      .filter(([type]) => type === 'max')
      .map(([, label]) => label);

    expect([...busiest].sort()).toEqual(['Max point at A', 'Max point at B', 'Max point at Z']);
  });

  test('keeps flows that are small in their own units apart', () => {
    // Measured against 1, 1e-12 and 5e-11 were the same throughput, and every
    // node was offered as both the busiest and the quietest: ] could land on
    // one fifty times quieter than the busiest.
    const tiny: FlowPoint[] = [
      { source: 'A', target: 'X', value: 1e-12 },
      { source: 'B', target: 'Y', value: 5e-11 },
    ];

    expect(offered(traceOf(TraceType.SANKEY, tiny))).toEqual([
      ['max', 'Max point at B', 5e-11],
      ['max', 'Max point at Y', 5e-11],
      ['min', 'Min point at A', 1e-12],
      ['min', 'Min point at X', 1e-12],
    ]);
  });
});

describe('a network\'s [ and ] go to its most and least connected node', () => {
  test('offers the hub, and the node linked to nobody but itself', () => {
    const trace = traceOf(TraceType.NETWORK, COLLAB);

    expect(trace.supportsExtremaNavigation()).toBe(true);
    expect(offered(trace)).toEqual([
      ['max', 'Max point at Ada', 4],
      ['min', 'Min point at Ida', 0],
    ]);
    expect(landing(trace, trace.getExtremaTargets()[0])).toEqual(['Ada', 4]);
  });

  test('offers every node holding the fewest links, so a tie is walked', () => {
    const pairs: NetworkPoint[] = [
      { source: 'Ada', target: 'Grace' },
      { source: 'Ada', target: 'Alan' },
      { source: 'Tim', target: 'Vint' },
    ];
    const least = offered(traceOf(TraceType.NETWORK, pairs))
      .filter(([type]) => type === 'min')
      .map(([, label]) => label);

    expect(least).toHaveLength(4);
    expect(least).not.toContain('Min point at Ada');
  });
});
