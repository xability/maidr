/**
 * @jest-environment jsdom
 */

/**
 * What a directed graph outlines as the reader moves.
 *
 * A node outlines its own element. A scope is derived from its nodes' paths
 * rather than declared, so the chart was given no element for it, and it
 * outlined nothing: the previous outline went and nothing replaced it, while
 * the canvas channel, `highlightedPointIndices`, already named every node in
 * the scope. A scope outlines those nodes now, the same ones.
 */

import type { DirectedGraphPoint, MaidrLayer } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { DirectedGraphTrace } from '@model/directedGraph';
import { TraceType } from '@type/grammar';

/**
 * A small ResNet: `input`, the closed `block1` of conv1, conv2 and add, the
 * closed `block2` of conv and pool, then `dense`. Declared out of order, so a
 * pairing by walk order would outline the wrong elements.
 */
const RESNET: DirectedGraphPoint[] = [
  { id: 'dense', inputs: ['block2/pool'] },
  { id: 'input' },
  { id: 'block1/conv1', label: 'conv1', path: ['block1'], inputs: ['input'] },
  { id: 'block1/conv2', label: 'conv2', path: ['block1'], inputs: ['block1/conv1'] },
  { id: 'block1/add', label: 'add', path: ['block1'], inputs: ['block1/conv2', 'input'] },
  { id: 'block2/conv', label: 'conv', path: ['block2'], inputs: ['block1/add'] },
  { id: 'block2/pool', label: 'pool', path: ['block2'], inputs: ['block2/conv'] },
];

/**
 * A layer drawing one `<rect id="n{i}">` per declared node.
 * @param withSelectors - Whether the layer names the drawn nodes
 * @returns The layer
 */
function createLayer(withSelectors: boolean): MaidrLayer {
  return {
    id: 'dag',
    type: TraceType.DIRECTED_GRAPH,
    data: RESNET,
    ...(withSelectors ? { selectors: RESNET.map((_, at) => `#n${at}`) } : {}),
  };
}

/**
 * The drawn nodes the highlight stands for, read through the hidden copy
 * each highlight element was made beside.
 * @param trace - The trace to read
 * @returns Their ids, sorted
 */
function outlined(trace: DirectedGraphTrace): string[] {
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    return [];
  }
  const { elements } = state.highlight;
  return (Array.isArray(elements) ? elements : [elements])
    .map(element => element.previousElementSibling?.id ?? '')
    .sort();
}

/**
 * The nodes the canvas channel names, as the ids they are drawn with.
 * @param trace - The trace to read
 * @returns Their ids, sorted
 */
function named(trace: DirectedGraphTrace): string[] {
  return [...trace.highlightedPointIndices].map(at => `n${at}`).sort();
}

describe('a directed graph\'s highlight', () => {
  beforeEach(() => {
    document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${
      RESNET.map((_, at) => `<rect id="n${at}"></rect>`).join('')
    }</svg>`;
  });

  test('a closed scope outlines every node in it, as the canvas channel names them', () => {
    const trace = new DirectedGraphTrace(createLayer(true));
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(outlined(trace)).toEqual(['n2', 'n3', 'n4']);
    expect(named(trace)).toEqual(outlined(trace));
  });

  test('opening the scope outlines the one node the reader is on', () => {
    const trace = new DirectedGraphTrace(createLayer(true));
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(outlined(trace)).toEqual(['n2']);
    expect(named(trace)).toEqual(['n2']);
  });

  test('a node outlines itself', () => {
    const trace = new DirectedGraphTrace(createLayer(true));
    trace.moveOnce('FORWARD');

    expect(outlined(trace)).toEqual(['n1']);
  });

  test('a layer naming no elements outlines nothing on a scope', () => {
    const trace = new DirectedGraphTrace(createLayer(false));
    trace.moveOnce('FORWARD');
    trace.moveOnce('FORWARD');

    expect(outlined(trace)).toEqual([]);
  });

  test('nothing is outlined before the reader has entered', () => {
    const trace = new DirectedGraphTrace(createLayer(true));

    expect(outlined(trace)).toEqual([]);
    expect(named(trace)).toEqual([]);
  });
});
