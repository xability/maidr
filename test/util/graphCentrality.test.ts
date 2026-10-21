import { describe, expect, test } from '@jest/globals';
import { centrality, withinCentralityBudget } from '@util/graphCentrality';

const betweenness = (adjacency: number[][]): readonly number[] => centrality(adjacency).betweenness;
const harmonicCloseness = (adjacency: number[][]): readonly number[] => centrality(adjacency).closeness;

/**
 * An undirected adjacency list from edge pairs, listing each edge from both ends.
 * @param n - How many nodes
 * @param edges - The edges, as index pairs
 * @returns Each node's neighbours
 */
function undirected(n: number, edges: [number, number][]): number[][] {
  const adjacency: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return adjacency;
}

describe('betweenness', () => {
  test('should score the centre of a star 1 and its leaves 0', () => {
    const star = undirected(5, [[0, 1], [0, 2], [0, 3], [0, 4]]);

    const scores = betweenness(star);

    expect(scores[0]).toBeCloseTo(1);
    expect(scores.slice(1)).toEqual([0, 0, 0, 0]);
  });

  test('should rank the middle of a path above its ends', () => {
    // 0 - 1 - 2 - 3 - 4: node 2 sits on 4 of the 6 pairs of others, 1 and 3 on 3.
    const path = undirected(5, [[0, 1], [1, 2], [2, 3], [3, 4]]);

    const scores = betweenness(path);

    expect(scores[2]).toBeCloseTo(4 / 6);
    expect(scores[1]).toBeCloseTo(3 / 6);
    expect(scores[3]).toBeCloseTo(3 / 6);
    expect(scores[0]).toBe(0);
    expect(scores[4]).toBe(0);
  });

  test('should split credit between equally short paths', () => {
    // A square: 0 and 2 are joined through 1 and through 3 equally.
    const square = undirected(4, [[0, 1], [1, 2], [2, 3], [3, 0]]);

    const scores = betweenness(square);

    // Each node carries half of the one pair across from it: 0.5 / 3 pairs.
    for (const score of scores) {
      expect(score).toBeCloseTo(0.5 / 3);
    }
  });

  test('should measure each piece of a disconnected graph on its own', () => {
    // A path of three, and an unlinked pair.
    const graph = undirected(5, [[0, 1], [1, 2], [3, 4]]);

    const scores = betweenness(graph);

    expect(scores[1]).toBeGreaterThan(0);
    expect(scores[3]).toBe(0);
    expect(scores[4]).toBe(0);
  });

  test('should follow edge direction on a directed graph', () => {
    // 0 -> 1 -> 2: only 1 is between anything, and only on the pair (0, 2).
    const chain = [[1], [2], []];

    const scores = betweenness(chain);

    expect(scores).toEqual([0, 1 / 2, 0]);
  });

  test('should score every node 0 below three nodes', () => {
    expect(betweenness([])).toEqual([]);
    expect(betweenness([[1], [0]])).toEqual([0, 0]);
  });
});

describe('harmonicCloseness', () => {
  test('should score a node linked to every other 1', () => {
    const star = undirected(4, [[0, 1], [0, 2], [0, 3]]);

    const scores = harmonicCloseness(star);

    expect(scores[0]).toBeCloseTo(1);
    // A leaf: one other at 1, two at 2.
    expect(scores[1]).toBeCloseTo((1 + 0.5 + 0.5) / 3);
  });

  test('should score an isolated node 0 rather than failing on infinite distances', () => {
    const graph = undirected(3, [[0, 1]]);

    const scores = harmonicCloseness(graph);

    expect(scores[2]).toBe(0);
    expect(scores[0]).toBeCloseTo(1 / 2);
  });

  test('should score nothing below two nodes', () => {
    expect(harmonicCloseness([[]])).toEqual([0]);
  });
});

describe('withinCentralityBudget', () => {
  test('should accept a chart-sized graph', () => {
    const ring = Array.from({ length: 1000 }, (_, i) => [(i + 1) % 1000, (i + 999) % 1000]);

    expect(withinCentralityBudget(ring)).toBe(true);
  });

  test('should refuse a graph whose walk from every node would stall the page', () => {
    // Thousands of nodes with no edges still cost n² to walk from each.
    const scattered = Array.from({ length: 4000 }, (): number[] => []);

    expect(withinCentralityBudget(scattered)).toBe(false);
  });

  test('should finish a graph at the edge of the budget quickly', () => {
    // n · (n + m) just inside the budget: 1,400 nodes, 4 entries each.
    const n = 1400;
    const graph = Array.from({ length: n }, (_, i) =>
      [(i + 1) % n, (i + n - 1) % n, (i + 7) % n, (i + n - 7) % n]);
    expect(withinCentralityBudget(graph)).toBe(true);

    const started = performance.now();
    centrality(graph);
    const elapsed = performance.now() - started;

    // Generous for a loaded CI runner; the walk itself takes a fraction of it.
    expect(elapsed).toBeLessThan(5000);
  });
});
