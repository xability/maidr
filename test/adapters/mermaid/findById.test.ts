/**
 * @jest-environment jsdom
 */

import { findById } from '@adapters/mermaid/read';
import { describe, expect, it } from '@jest/globals';

/**
 * How the Mermaid adapter pairs a node with the element drawn for it.
 *
 * Mermaid's ids are a stem and a counter that moves between parses, so the
 * matching is loose on purpose; these tests pin exactly how loose, and in
 * which order the candidates are tried.
 */

/**
 * Elements with the given ids, in document order.
 *
 * @param ids - The ids
 * @returns The elements
 */
function elements(ids: string[]): Element[] {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const id of ids) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.id = id;
    svg.appendChild(group);
  }
  return [...svg.children];
}

/**
 * Pairs each list of keys in turn, sharing one set of used elements.
 *
 * @param ids - The candidate ids, in document order
 * @param svgId - The diagram's id prefix
 * @param keyLists - The keys of each node, in reading order
 * @returns The id each node was paired with, or null
 */
function pair(ids: string[], svgId: string, keyLists: (string | undefined)[][]): (string | null)[] {
  const candidates = elements(ids);
  const used = new Set<Element>();
  return keyLists.map(keys => findById(candidates, svgId, keys, used)?.id ?? null);
}

describe('findById', () => {
  it('should match an id exactly, with or without the diagram prefix', () => {
    const result = pair(['m-A', 'B'], 'm', [['A'], ['B']]);

    expect(result).toEqual(['m-A', 'B']);
  });

  it('should match a stem whose counter moved, with an optional type prefix', () => {
    const result = pair(['m-flowchart-A-12', 'm-classId-Animal-3', 'm-Plain'], 'm', [
      ['flowchart-A-0'],
      ['Animal'],
      ['Plain-7'],
    ]);

    expect(result).toEqual(['m-flowchart-A-12', 'm-classId-Animal-3', 'm-Plain']);
  });

  it('should try every key exactly before any key loosely', () => {
    const result = pair(['m-flowchart-A-5', 'm-A'], 'm', [['flowchart-A-0', 'A']]);

    expect(result).toEqual(['m-A']);
  });

  it('should prefer an earlier key to an earlier element', () => {
    const result = pair(['m-flowchart-B-1', 'm-flowchart-A-1'], 'm', [['A-9', 'B-9']]);

    expect(result).toEqual(['m-flowchart-A-1']);
  });

  it('should take the first free element in document order', () => {
    const result = pair(['m-node-X-1', 'X', 'm-X', 'm-type-X-2'], 'm', [['X'], ['X'], ['X'], ['X'], ['X']]);

    expect(result).toEqual(['X', 'm-X', 'm-node-X-1', 'm-type-X-2', null]);
  });

  it('should treat regex-special characters in keys and the prefix literally', () => {
    const result = pair(
      ['my.svg-a.b-1', 'myXsvg-a+b-1', 'my.svg-a+b-2', 'my.svg-(x|y)-3', 'my.svg-x'],
      'my.svg',
      [['a.b'], ['a+b'], ['(x|y)'], ['x|y'], ['[x]']],
    );

    expect(result).toEqual(['my.svg-a.b-1', 'my.svg-a+b-2', 'my.svg-(x|y)-3', null, null]);
  });

  it('should keep a stem that ends in digits apart from its counter', () => {
    const result = pair(['m-flowchart-A1-4', 'm-flowchart-A-14', 'm-A-1-2'], 'm', [['A1-0'], ['A-14'], ['A-1-9'], ['A']]);

    expect(result).toEqual(['m-flowchart-A1-4', 'm-flowchart-A-14', 'm-A-1-2', null]);
  });

  it('should accept only letters as a type prefix', () => {
    const result = pair(['m-x1-A-0', 'm-a-b-A-0', 'm-ab-A-0'], 'm', [['A'], ['A']]);

    expect(result).toEqual(['m-ab-A-0', null]);
  });

  it('should match case-sensitively and only under the diagram prefix', () => {
    const result = pair(['m-flowchart-a-1', 'other-flowchart-A-1', 'mm-A-1'], 'm', [['A']]);

    expect(result).toEqual([null]);
  });

  it('should skip absent and empty keys', () => {
    const result = pair(['m-A-3'], 'm', [[undefined, '', 'A']]);

    expect(result).toEqual(['m-A-3']);
  });

  it('should not pair an element already used elsewhere', () => {
    const candidates = elements(['m-A-1', 'm-A-2']);
    const used = new Set<Element>([candidates[0]]);

    const found = findById(candidates, 'm', ['A'], used);

    expect(found?.id).toBe('m-A-2');
    expect(used.has(candidates[1])).toBe(true);
  });

  it('should pair thousands of nodes whose counters all moved', () => {
    const count = 3000;
    const ids = Array.from({ length: count }, (_, at) => `m-flowchart-N${at}-${at + 1}`);
    const keys = Array.from({ length: count }, (_, at) => [`flowchart-N${at}-${at}`, `N${at}`]);

    const result = pair(ids, 'm', keys);

    expect(result).toEqual(ids);
  });
});
