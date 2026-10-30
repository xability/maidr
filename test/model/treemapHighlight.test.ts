/**
 * @jest-environment jsdom
 */

/**
 * What a hierarchy outlines as the reader moves.
 *
 * A declared node outlines its own shape. A node derived from its children's
 * paths has no selector, and outlined nothing: on a layer listing only its
 * leaves, that is the whole top level of the tree, where the reader enters.
 * It outlines the nodes below it that the chart drew now, the block a treemap
 * tiles for it.
 */

import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { TreemapTrace } from '@model/treemap';
import { TraceType } from '@type/grammar';

/**
 * Two continents of countries, only the countries declared and drawn.
 */
const LEAVES: TreemapPoint[] = [
  { x: 'France', y: 67, path: ['Europe'] },
  { x: 'Germany', y: 83, path: ['Europe'] },
  { x: 'Japan', y: 125, path: ['Asia'] },
  { x: 'India', y: 1400, path: ['Asia'] },
];

/**
 * A three-level tree whose middle level is declared and drawn, and whose
 * top is derived: a sunburst that declares its inner ring.
 */
const RINGS: TreemapPoint[] = [
  { x: 'West', path: ['Europe'] },
  { x: 'France', y: 67, path: ['Europe', 'West'] },
  { x: 'East', path: ['Europe'] },
  { x: 'Poland', y: 38, path: ['Europe', 'East'] },
];

/**
 * A layer drawing one `<rect id="n{i}">` per declared node.
 * @param data - The declared nodes
 * @param type - How the tree is drawn
 * @returns The layer
 */
function createLayer(data: TreemapPoint[], type: TraceType = TraceType.TREEMAP): MaidrLayer {
  return {
    id: 'tree',
    type,
    data,
    selectors: data.map((_, at) => `#n${at}`),
  };
}

/**
 * The drawn nodes the highlight stands for, read through the hidden copy
 * each highlight element was made beside.
 * @param trace - The trace to read
 * @returns Their ids, in order
 */
function outlined(trace: TreemapTrace): string[] {
  const state = trace.state;
  if (state.empty || state.highlight.empty) {
    return [];
  }
  const { elements } = state.highlight;
  return (Array.isArray(elements) ? elements : [elements])
    .map(element => element.previousElementSibling?.id ?? '');
}

/**
 * Draws one rect per declared node and builds the trace over them.
 * @param data - The declared nodes
 * @param type - How the tree is drawn
 * @returns The trace, not yet entered
 */
function drawnTree(data: TreemapPoint[], type: TraceType = TraceType.TREEMAP): TreemapTrace {
  document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${
    data.map((_, at) => `<rect id="n${at}"></rect>`).join('')
  }</svg>`;
  return new TreemapTrace(createLayer(data, type));
}

describe('a hierarchy\'s highlight', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test.each([TraceType.TREEMAP, TraceType.SUNBURST, TraceType.ICICLE])(
    '%s: the derived top level, where the reader enters, outlines the leaves below it',
    (type) => {
      const trace = drawnTree(LEAVES, type);
      trace.moveOnce('FORWARD');

      expect(outlined(trace)).toEqual(['n0', 'n1']);

      trace.moveOnce('FORWARD');

      expect(outlined(trace)).toEqual(['n2', 'n3']);
    },
  );

  test('a declared node outlines its own shape', () => {
    const trace = drawnTree(LEAVES);
    trace.moveOnce('FORWARD');
    trace.moveOnce('DOWNWARD');

    expect(outlined(trace)).toEqual(['n0']);
  });

  test('a derived node outlines the declared nodes nearest below it, not their own children', () => {
    const trace = drawnTree(RINGS, TraceType.SUNBURST);
    trace.moveOnce('FORWARD');

    expect(outlined(trace)).toEqual(['n0', 'n2']);
  });

  test('nothing is outlined before the reader has entered', () => {
    const trace = drawnTree(LEAVES);

    expect(outlined(trace)).toEqual([]);
  });

  test('a layer naming no elements outlines nothing on a derived node', () => {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const trace = new TreemapTrace({ id: 'tree', type: TraceType.TREEMAP, data: LEAVES });
    trace.moveOnce('FORWARD');

    expect(outlined(trace)).toEqual([]);
  });
});
