/**
 * @jest-environment jsdom
 */
import type { FlowPoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { FlowTrace } from '@model/flow';
import { TraceType } from '@type/grammar';

/**
 * Three flows out of one node, declared out of value order.
 *
 * The order is the whole point. A selector list is one entry per flow in
 * **declared** order, while the trace sorts every node's edges by value the
 * moment it builds them -- so a chart authored largest-first cannot tell a
 * correct pairing from one that re-derives a position from the sorted list.
 */
const FLOWS: FlowPoint[] = [
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
];

/**
 * Create a flow layer whose selectors name each ribbon by its own flow.
 * @returns Flow layer definition
 */
function createLayer(): MaidrLayer {
  return {
    id: 'test-flow-highlight',
    type: TraceType.SANKEY,
    title: 'Energy flow',
    axes: { x: { label: 'Node' }, y: { label: 'Petajoules' } },
    selectors: FLOWS.map((_, index) => `#ribbon-${index}`),
    data: FLOWS,
  };
}

describe('a highlighted ribbon is the ribbon that was announced', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <path id="ribbon-0" data-flow="Coal-Losses" />
        <path id="ribbon-1" data-flow="Coal-Electricity" />
        <path id="ribbon-2" data-flow="Coal-Heat" />
      </svg>`;
  });

  test('the source node highlights the ribbon its widest flow drew', () => {
    // Coal's widest flow is to Electricity, which is `ribbon-1`. Pairing by
    // rank in the sorted edge list would take `ribbon-0` -- the Losses
    // ribbon -- while the announcement said Electricity, and nothing about
    // the announcement would look wrong.
    const trace = new FlowTrace(createLayer());
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty) {
      throw new Error('Expected a non-empty trace state');
    }

    expect(state.text.main.value).toBe('Coal');
    expect(state.highlight.empty).toBe(false);
    if (state.highlight.empty) {
      throw new Error('Expected a populated highlight state');
    }
    const highlighted = state.highlight.elements;
    const first = Array.isArray(highlighted) ? highlighted.flat()[0] : highlighted;

    expect(first?.getAttribute('data-flow')).toBe('Coal-Electricity');
  });

  test('a target node highlights the ribbon that reaches it', () => {
    const trace = new FlowTrace(createLayer());
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    const state = trace.state;
    if (state.empty || state.highlight.empty) {
      throw new Error('Expected a populated state');
    }

    expect(state.text.main.value).toBe('Electricity');
    const highlighted = state.highlight.elements;
    const first = Array.isArray(highlighted) ? highlighted.flat()[0] : highlighted;

    expect(first?.getAttribute('data-flow')).toBe('Coal-Electricity');
  });

  test('every ribbon is offered as the shape, whichever one is highlighted', () => {
    // A node highlights the widest ribbon touching it, which is one of
    // several. A renderer drawing the chart's shape needs all of them, in
    // the order the flows were declared, so a thin cross-flow is on the
    // display even though no node ever highlights it.
    const trace = new FlowTrace(createLayer());

    expect(trace.getGeometryElements().map(ribbon => ribbon.id))
      .toEqual(['ribbon-0', 'ribbon-1', 'ribbon-2']);
  });

  test('no shape is offered when the ribbons did not resolve', () => {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const trace = new FlowTrace(createLayer());

    expect(trace.getGeometryElements()).toEqual([]);
  });
});
