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

/**
 * The Mermaid example's energy sankey: three sources into Electricity, which
 * splits in two, and Gas also feeding Heating.
 */
const ENERGY: FlowPoint[] = [
  { source: 'Solar', target: 'Electricity', value: 40 },
  { source: 'Wind', target: 'Electricity', value: 35 },
  { source: 'Gas', target: 'Electricity', value: 60 },
  { source: 'Gas', target: 'Heating', value: 45 },
  { source: 'Electricity', target: 'Homes', value: 70 },
  { source: 'Electricity', target: 'Industry', value: 65 },
];

describe('a step along a ribbon highlights the ribbon it announced', () => {
  beforeEach(() => {
    const ribbons = ENERGY
      .map((flow, index) => `<path id="energy-${index}" data-flow="${flow.source}-${flow.target}" />`)
      .join('');
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${ribbons}</svg>`;
  });

  /**
   * Builds the trace.
   * @returns The energy sankey's trace
   */
  function energy(): FlowTrace {
    return new FlowTrace({
      id: 'test-flow-along',
      type: TraceType.SANKEY,
      axes: { x: { label: 'Node' }, y: { label: 'Value' } },
      selectors: ENERGY.map((_, index) => `#energy-${index}`),
      data: ENERGY,
    });
  }

  /**
   * What the reader is told and shown at the cursor.
   * @param trace - The trace
   * @returns The node, the step's "Along" aside, the ribbon the SVG highlight
   *   covers and the one the canvas channel names
   */
  function shown(trace: FlowTrace): { node: string; along?: string; svg?: string | null; canvas: string[] } {
    const state = trace.state;
    if (state.empty || state.highlight.empty) {
      throw new Error('Expected a populated state');
    }
    const elements = state.highlight.elements;
    const first = Array.isArray(elements) ? elements.flat()[0] : elements;
    return {
      node: String(state.text.main.value),
      along: state.text.asides?.find(aside => aside.label === 'Along')?.value,
      svg: first?.getAttribute('data-flow'),
      canvas: trace.highlightedPointIndices.map(at => `${ENERGY[at].source}-${ENERGY[at].target}`),
    };
  }

  test('arriving forward lights the ribbon taken in, not the node\'s widest out', () => {
    const trace = energy();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('FORWARD');

    const at = shown(trace);
    expect(at.node).toBe('Electricity');
    expect(at.along).toContain('Wind to Electricity');
    expect(at.svg).toBe('Wind-Electricity');
    expect(at.canvas).toEqual(['Wind-Electricity']);
  });

  test('arriving backward lights the ribbon taken, not the node\'s widest out', () => {
    const trace = energy();
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    expect(shown(trace).node).toBe('Heating');
    trace.moveOnce('BACKWARD');

    const at = shown(trace);
    expect(at.node).toBe('Gas');
    expect(at.along).toContain('Gas to Heating');
    expect(at.svg).toBe('Gas-Heating');
    expect(at.canvas).toEqual(['Gas-Heating']);
  });

  test('a rotor step lights the flow it walked', () => {
    const trace = energy();
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');
    trace.moveOnce('DOWNWARD');
    expect(shown(trace).node).toBe('Gas');
    trace.moveToRotorFilter('outgoing', 'right');

    const at = shown(trace);
    expect(at.node).toBe('Electricity');
    expect(at.along).toContain('Gas to Electricity');
    expect(at.svg).toBe('Gas-Electricity');
    expect(at.canvas).toEqual(['Gas-Electricity']);
  });

  test('a move that follows no ribbon lights the node\'s own', () => {
    const trace = energy();
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    const down = shown(trace);
    expect(down.node).toBe('Heating');
    expect(down.along).toBeUndefined();
    // A sink's own ribbon is the widest arriving.
    expect(down.svg).toBe('Gas-Heating');
    expect(down.canvas).toEqual(['Gas-Heating']);

    trace.moveOnce('UPWARD');
    const up = shown(trace);
    expect(up.node).toBe('Electricity');
    expect(up.svg).toBe('Electricity-Homes');
    expect(up.canvas).toEqual(['Electricity-Homes']);
  });
});
