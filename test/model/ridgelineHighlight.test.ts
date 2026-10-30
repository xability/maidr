/**
 * @jest-environment jsdom
 */

/**
 * Where a ridgeline's highlight stands as the reader walks a curve.
 *
 * A ridgeline draws one filled path per group, and every sample of a group
 * outlined the whole of that path, so the highlight stayed where it was on
 * every step along the curve. Each sample is marked on top of its group's
 * curve now, at its value.
 */

import type { RidgelineTrace } from '@model/ridgeline';
import type { MaidrLayer, ViolinKdePoint } from '@type/grammar';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/** Two groups' densities, sampled at the values 0 to 3. */
const DENSITIES = [
  [0.25, 0.5, 1, 0.75],
  [0.5, 1, 0.25, 0.125],
];

const GROUPS: ViolinKdePoint[][] = DENSITIES.map((row, group) =>
  row.map((density, value) => ({ x: `Step ${group}`, y: value, density })));

/** Where a value is drawn across the page. */
const across = (value: number): number => 100 + 50 * value;

/** Where a group's curve stands on the page: the first at 100, the next 60 lower. */
const baseline = (group: number): number => 100 + 60 * group;

/** Where a group's curve is drawn at a density. */
const top = (group: number, density: number): number => baseline(group) - 40 * density;

/**
 * A group's ridge as matplotlib's `fill_between` draws it: up from its
 * baseline, along the curve, down, and back along the baseline.
 * @param group - The group
 * @returns The path's `d`
 */
function ridgePath(group: number): string {
  const values = DENSITIES[group].map((_, value) => value);
  const curve = values.map(value => `L ${across(value)},${top(group, DENSITIES[group][value])}`);
  const back = [...values].reverse().map(value => `L ${across(value)},${baseline(group)}`);
  return `M ${across(0)},${baseline(group)} ${curve.join(' ')} ${back.join(' ')} Z`;
}

/**
 * Draws each group's ridge and builds the trace over them.
 * @param tag - What each ridge is drawn as
 * @returns The trace, not yet entered
 */
function ridgeline(tag: 'path' | 'rect' = 'path'): RidgelineTrace {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${
    DENSITIES.map((_, group) => `<${tag} class="ridge" d="${ridgePath(group)}"></${tag}>`).join('')
  }</svg>`;
  const layer: MaidrLayer = {
    id: 'ridgeline',
    type: TraceType.RIDGELINE,
    axes: { x: { label: 'Activations' }, y: { label: 'Step' } },
    selectors: '.ridge',
    data: GROUPS,
  };
  return TraceFactory.create(layer) as RidgelineTrace;
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
 * @returns The non-empty trace state
 */
function stateOf(trace: RidgelineTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Where the highlight marks the sample the reader is on.
 * @param trace - The trace to read
 * @returns The marker's centre, or null with no single marker
 */
function markedAt(trace: RidgelineTrace): [number, number] | null {
  const highlight = stateOf(trace).highlight;
  const elements = highlight.empty ? [] : [highlight.elements].flat();
  if (elements.length !== 1 || elements[0].tagName.toLowerCase() !== 'circle') {
    return null;
  }
  return [Number(elements[0].getAttribute('cx')), Number(elements[0].getAttribute('cy'))];
}

describe('a ridgeline\'s highlight', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('marks each sample on top of its group\'s curve, and moves along it', () => {
    const trace = ridgeline();
    trace.moveOnce('FORWARD');

    expect(markedAt(trace)).toEqual([across(0), top(0, 0.25)]);

    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(markedAt(trace)).toEqual([across(2), top(0, 1)]);
  });

  test('marks another group\'s sample on that group\'s own curve', () => {
    const trace = ridgeline();
    trace.moveToIndex(1, 1);

    expect(markedAt(trace)).toEqual([across(1), top(1, 1)]);
  });

  test('outlines a curve it cannot read whole at every sample, as before', () => {
    const trace = ridgeline('rect');
    trace.moveOnce('FORWARD');
    const first = stateOf(trace).highlight;
    trace.moveOnce('FORWARD');
    const second = stateOf(trace).highlight;

    expect(first.empty ? null : first.elements).toBe(second.empty ? undefined : second.elements);
    expect(first.empty ? '' : [first.elements].flat()[0].tagName.toLowerCase()).toBe('rect');
  });
});
