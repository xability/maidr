/**
 * Centrality measures for the object list's graph sorts.
 *
 * Pure functions over an adjacency list -- `adjacency[i]` is the indices of the
 * nodes `i` has an edge to -- so any trace that can describe its graph that way
 * can offer them, and the arithmetic is tested without a chart. Edges are
 * unweighted: none of the node-link layers carries a weight on its links, and a
 * flow's amounts are a magnitude of their own, sorted by directly.
 *
 * Both measures come out of one breadth-first walk from every node, which costs
 * `n · (n + m)` for `n` nodes and `m` adjacency entries. That is nothing on the
 * charts drawn so far and seconds on a graph of thousands of nodes, so a trace
 * offers them only within {@link CENTRALITY_BUDGET}, and computes them when
 * the reader first asks for one of the sorts rather than when the list opens.
 */

/**
 * The largest `n · (n + m)` a trace computes centrality for.
 *
 * About ten million steps of the walk: a tenth of a second on a laptop and a
 * few tenths on a slow phone, paid once, on the press that asks for the sort.
 * A graph past it is still listed and sorted by everything else; it just is
 * not offered these.
 */
export const CENTRALITY_BUDGET = 1e7;

/** Both measures, one value per node, in the adjacency list's order. */
export interface Centrality {
  /** {@link centrality}'s betweenness. */
  readonly betweenness: readonly number[];
  /** {@link centrality}'s harmonic closeness. */
  readonly closeness: readonly number[];
}

/**
 * How many entries an adjacency list holds -- each undirected edge twice.
 * @param adjacency - Each node's neighbours
 * @returns The number of entries
 */
function entriesOf(adjacency: readonly (readonly number[])[]): number {
  return adjacency.reduce((total, neighbours) => total + neighbours.length, 0);
}

/**
 * Whether a graph is small enough to compute centrality for on demand.
 * @param adjacency - Each node's neighbours
 * @returns True within {@link CENTRALITY_BUDGET}
 */
export function withinCentralityBudget(adjacency: readonly (readonly number[])[]): boolean {
  const n = adjacency.length;
  return n * (n + entriesOf(adjacency)) <= CENTRALITY_BUDGET;
}

/**
 * Betweenness and harmonic closeness centrality, from one walk.
 *
 * **Betweenness** is the share of shortest paths between other nodes that pass
 * through a node -- how much of a bridge or a broker it is. Brandes' algorithm
 * over unweighted edges, normalised to 0..1 by the number of ordered pairs of
 * other nodes, `(n − 1)(n − 2)`, so a value reads the same on a graph of any
 * size. On an undirected graph every path is found from both of its ends,
 * which that divisor already accounts for: the centre of a star scores 1
 * either way. A pair with no path between them adds nothing, so a graph in
 * several pieces is measured within each piece.
 *
 * **Harmonic closeness** is how near a node is to all the others: the mean of
 * `1 / distance` over every other node. The harmonic form rather than the
 * reciprocal of summed distances, because these graphs are often in several
 * pieces, and an unreachable node then adds zero instead of making every
 * distance infinite. A node linked directly to every other scores 1, an
 * isolated node 0. On a directed graph it measures how near the nodes a node
 * reaches are.
 *
 * Each walk's credit flows back along the edges it came down, read from the
 * distances rather than from a list of predecessors kept per node, so the walk
 * reuses the same few typed arrays for every source.
 * @param adjacency - Each node's neighbours. For an undirected graph, list every
 * edge from both ends
 * @returns Both measures, one value per node
 */
export function centrality(adjacency: readonly (readonly number[])[]): Centrality {
  const n = adjacency.length;
  const betweenness = new Float64Array(n);
  const closeness = new Float64Array(n);
  if (n < 2) {
    return { betweenness: Array.from(betweenness), closeness: Array.from(closeness) };
  }

  const distance = new Int32Array(n);
  const paths = new Float64Array(n);
  const dependency = new Float64Array(n);
  const order = new Int32Array(n);

  for (let source = 0; source < n; source++) {
    distance.fill(-1);
    paths.fill(0);
    dependency.fill(0);

    distance[source] = 0;
    paths[source] = 1;
    order[0] = source;
    let visited = 1;
    let reach = 0;
    for (let head = 0; head < visited; head++) {
      const node = order[head];
      const next = distance[node] + 1;
      for (const neighbour of adjacency[node]) {
        if (distance[neighbour] < 0) {
          distance[neighbour] = next;
          order[visited++] = neighbour;
          reach += 1 / next;
        }
        if (distance[neighbour] === next) {
          paths[neighbour] += paths[node];
        }
      }
    }
    closeness[source] = reach / (n - 1);

    // Farthest first, so every node's dependency is complete before the nodes
    // one step nearer the source draw on it.
    for (let i = visited - 1; i > 0; i--) {
      const node = order[i];
      const next = distance[node] + 1;
      let credit = 0;
      for (const neighbour of adjacency[node]) {
        if (distance[neighbour] === next) {
          credit += (paths[node] / paths[neighbour]) * (1 + dependency[neighbour]);
        }
      }
      dependency[node] = credit;
      betweenness[node] += credit;
    }
  }

  const pairs = (n - 1) * (n - 2);
  return {
    betweenness: Array.from(betweenness, score => (pairs > 0 ? score / pairs : 0)),
    closeness: Array.from(closeness),
  };
}
