import type { FlowPoint, MaidrLayer } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { FlowTrace } from '@model/flow';
import { TraceType } from '@type/grammar';

/**
 * The first arrow press on a flow chart is the initial entry: it lands on the
 * first node without following anything. The announcement must not claim a
 * ribbon was traversed on a keystroke that only entered the chart.
 */
const ENERGY: FlowPoint[] = [
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Electricity', target: 'Homes', value: 30 },
];

function createLayer(): MaidrLayer {
  return {
    id: 'flow',
    type: TraceType.SANKEY,
    title: 'Energy flow',
    axes: { x: { label: 'Node' }, y: { label: 'Petajoules' } },
    data: ENERGY,
  };
}

function nonEmptyState(trace: FlowTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

function alongOf(trace: FlowTrace): string | undefined {
  return nonEmptyState(trace).text.asides?.find(aside => aside.label === 'Along')?.value;
}

describe('entering a flow chart', () => {
  test('does not announce a ribbon the reader never followed', () => {
    const trace = new FlowTrace(createLayer());

    trace.moveOnce('FORWARD');

    expect(nonEmptyState(trace).text.main.value).toBe('Coal');
    expect(alongOf(trace)).toBeUndefined();
  });

  test('announces the ribbon once a move actually follows one', () => {
    const trace = new FlowTrace(createLayer());
    trace.moveOnce('FORWARD');

    trace.moveOnce('FORWARD');

    expect(alongOf(trace)).toMatch(/^Coal to /);
  });
});
