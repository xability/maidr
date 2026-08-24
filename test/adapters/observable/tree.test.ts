/**
 * A node-link diagram, which is the case the span readings refuse (#1106).
 *
 * `Plot.tree` is the first one to reach these tests. It draws three kinds of
 * mark at once — `link` for the edges, `dot` for the nodes, `text` for their
 * names — so it exercises two things the adapter already decided and one it
 * has not.
 *
 * The edges are what #1094 and #1100 wrote their whole-mark span test for: a
 * link whose two ends share a coordinate is an interval in a lane, and one
 * whose ends share nothing is an edge with no lane to sit in. A tree's links
 * are the second kind, four of them, and this is the first chart in the suite
 * where that is true.
 *
 * The third is the chart itself, and it was a defect pinned here until #1168.
 * Its dots read as an ordinary scatter, so the chart bound and navigated —
 * and what it announced was d3's tree *layout* coordinates, depth against
 * sibling offset, on scales the chart draws with `axis: null` precisely
 * because they mean nothing to a reader. Every node's path was sitting in the
 * `<title>` of the circle being announced, and in a `text` mark beside it,
 * and both were dropped.
 *
 * It is read as a hierarchy now. The paths in those titles are the tree,
 * exactly and without a heuristic, so the layer carries each node's name and
 * its ancestors and names no axis but the node one — there being no magnitude
 * in a tree layout to put on a second.
 */

import type { TreemapPoint } from '@type/grammar';
import { observablePlotToMaidr } from '@adapters/observable/converters';
import { treeComposite } from '@adapters/observable/introspect';
import { describe, expect, it } from '@jest/globals';
import { TraceType } from '@type/grammar';
import { JSDOM } from 'jsdom';
import { mountFixture } from './helpers';

function layersOf(key: Parameters<typeof mountFixture>[0]): {
  type: TraceType;
  axes?: unknown;
  data: TreemapPoint[];
}[] {
  const { element } = mountFixture(key);
  return (observablePlotToMaidr(element)?.subplots[0][0].layers ?? []) as {
    type: TraceType;
    axes?: unknown;
    data: TreemapPoint[];
  }[];
}

describe('a tree\'s edges', () => {
  it('are not claimed as a gantt', () => {
    // Four curves running `M0,266C…,319.5,133` — both ends differ on both
    // axes, so no coordinate is shared and there is no lane. Read as spans
    // they would announce a schedule whose tasks are tree depths.
    expect(layersOf('hierarchyTree').some(layer => layer.type === TraceType.GANTT))
      .toBe(false);
  });
});

describe('a tree\'s nodes', () => {
  it('are not announced as layout coordinates (#1168)', () => {
    // What this pinned until the hierarchy reading landed: the dots read as a
    // scatter of `x = depth`, `y = sibling offset`. Those are d3's layout
    // output, not anything plotted, and announcing them described a chart the
    // reader does not have.
    expect(layersOf('hierarchyTree').some(layer => layer.type === TraceType.SCATTER))
      .toBe(false);
  });

  it('are the hierarchy the titles spell out', () => {
    const layers = layersOf('hierarchyTree');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.TREE]);
    expect((layers[0] as { data: TreemapPoint[] }).data).toEqual([
      { x: 'a', path: [] },
      { x: 'b', path: ['a'] },
      { x: 'c', path: ['a'] },
      { x: 'd', path: ['a', 'b'] },
      { x: 'e', path: ['a', 'b'] },
    ]);
  });

  it('are pointed at one by one', () => {
    // A hierarchy is navigated node by node, so each needs its own outline.
    // One selector for the whole layer would highlight every node at once.
    const [layer] = layersOf('hierarchyTree') as { selectors?: string[] }[];

    expect(layer.selectors).toHaveLength(5);
    expect(new Set(layer.selectors)).toHaveProperty('size', 5);
  });

  it('drop the root Plot invents for a forest', () => {
    // Given more than one root, Plot adds an unnamed one above them so its
    // layout has somewhere to start, and draws a dot for it titled `/` with
    // no label. Announcing it would put a node with no name above two the
    // reader can name.
    const layers = layersOf('forestTree');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.TREE]);
    expect((layers[0] as { data: TreemapPoint[] }).data).toEqual([
      { x: 'x', path: [] },
      { x: 'y', path: [] },
      { x: '1', path: ['x'] },
      { x: '2', path: ['y'] },
    ]);
  });

  it('are found with another mark drawn in front of them', () => {
    // A scatter drawn before the tree puts a second `dot` group ahead of the
    // tree's own. Looking at the first of each mark asked the hierarchy
    // question of the scatter, got no for an answer, and gave up -- so the
    // whole of #1168 came back on a chart one unrelated mark away from the
    // one above. Both marks are read here, each as what it is.
    const layers = layersOf('scatterBeforeTree');

    expect(layers.map(layer => layer.type)).toEqual([TraceType.TREE, TraceType.SCATTER]);
    expect(layers[0].data).toEqual([
      { x: 'a', path: [] },
      { x: 'b', path: ['a'] },
      { x: 'c', path: ['a'] },
      { x: 'd', path: ['a', 'b'] },
      { x: 'e', path: ['a', 'b'] },
    ]);
    expect(layers[1].data).toHaveLength(2);
  });

  it('are named from their own titles, not from a label paired onto them', () => {
    // Two trees in one plot share a pair of scales, so both roots land on the
    // same point and each tree's labels sit on the other's dots as squarely as
    // on their own. Read from the pairing, the first tree announced the
    // second's names. The dot's own `<title>` is on the mark being read and
    // cannot be confused with a neighbour's.
    //
    // Only the first tree is read: two of them drawn over one another is not a
    // chart anyone makes, and the second is left as it was rather than the two
    // being merged into a hierarchy neither draws.
    const [layer] = layersOf('twoTrees');

    expect(layer.type).toBe(TraceType.TREE);
    expect(layer.data.map(node => node.x)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('carry no magnitude, because a tree layout has none', () => {
    // Every dot is drawn the same size. Naming a value axis would claim a
    // second dimension the chart does not have (#1153).
    const [layer] = layersOf('hierarchyTree') as { axes?: unknown; data: TreemapPoint[] }[];

    expect(layer.axes).toEqual({ x: { label: 'Node' } });
    expect(layer.data.every(node => node.y === undefined)).toBe(true);
  });
});

/**
 * What separates a tree from a chart that merely looks like one.
 *
 * The three guards below were each written for a reason and none of the
 * captured fixtures exercises them — measured, dropping any of the three left
 * every test in this file passing. They are asked of `treeComposite` directly,
 * with hand-built groups, because what they refuse is a chart no fixture
 * holds: the point is the refusal, not the reading.
 */

/**
 * A mark group of the given kind, holding one element per entry.
 *
 * @param document - The document to build in
 * @param label    - The mark's Plot `aria-label`
 * @param titles   - One `<title>` per element, or `null` for an element
 *                   carrying none
 * @returns The group, in the shape `findMarkGroups` returns
 */
function markGroup(
  document: Document,
  label: string,
  titles: (string | null)[],
): { label: string; group: Element } {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('aria-label', label);
  for (const title of titles) {
    const node = document.createElementNS(
      'http://www.w3.org/2000/svg',
      label === 'text' ? 'text' : 'circle',
    );
    if (title !== null) {
      const titleNode = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleNode.textContent = title;
      node.appendChild(titleNode);
    }
    group.appendChild(node);
  }
  return { label, group };
}

describe('what is not a tree', () => {
  const document = new JSDOM('<!doctype html><body></body>').window.document;
  const paths = ['/a', '/a/b', '/a/c'];

  it('needs the edges, not only the names', () => {
    // A labelled scatter whose labels are paths draws no `link`. Claiming it
    // would turn an ordinary chart into a hierarchy on the strength of how
    // its labels are spelled.
    expect(treeComposite([
      markGroup(document, 'dot', paths),
      markGroup(document, 'text', paths),
    ])).toBeNull();
  });

  it('needs the names to be paths, not only present', () => {
    // A link chart with labelled ends — an arc diagram, a slope chart with
    // names on it — has all three marks and no hierarchy in them.
    expect(treeComposite([
      markGroup(document, 'link', [null, null]),
      markGroup(document, 'dot', ['Alice', 'Bob']),
      markGroup(document, 'text', ['Alice', 'Bob']),
    ])).toBeNull();
  });

  it('needs every parent to be a node the chart drew', () => {
    // The sharp case. `/a/b/c` names `/a/b` as its parent; if `/a/b` is not
    // on the chart, announcing `c` under `b` puts it beneath a node the
    // reader can never reach.
    expect(treeComposite([
      markGroup(document, 'link', [null]),
      markGroup(document, 'dot', ['/a', '/a/b/c']),
      markGroup(document, 'text', ['/a', '/a/b/c']),
    ])).toBeNull();
  });

  it('needs the paths to start where Plot starts them', () => {
    // Plot always writes the leading separator, because the path it joins
    // begins at an implicit root above the one you declared. Titles that do
    // not have it did not come from a tree.
    //
    // The case that makes the check earn its place is narrower than it looks.
    // `['Alice', 'Bob']` is refused with or without it -- `'Alice'` has no
    // separator, so its parent prefix comes out `'Alic'` and matches nothing.
    // A **one-character** root is the one that slips through: `'a'.slice(0, -1)`
    // is `''`, which reads as a root, and `'a/b'` then finds its parent. So a
    // scatter labelled `a`, `a/b` would be claimed as a hierarchy.
    expect(treeComposite([
      markGroup(document, 'link', [null]),
      markGroup(document, 'dot', ['a', 'a/b']),
      markGroup(document, 'text', ['a', 'a/b']),
    ])).toBeNull();
  });

  it('looks past a mark drawn in front of the tree', () => {
    // The index search, asked directly: the tree's groups are the second dot
    // and the link before it, not the first of each.
    expect(treeComposite([
      markGroup(document, 'link', [null]),
      markGroup(document, 'dot', [null, null]),
      markGroup(document, 'link', [null]),
      markGroup(document, 'dot', paths),
      markGroup(document, 'text', paths),
    ])).toEqual({ link: 2, dot: 3, texts: [4] });
  });

  it('claims only the text marks naming its own nodes', () => {
    // A labelled mark beside the tree has titles of its own. Requiring every
    // text mark in the plot to be titled with a path refused the tree because
    // of a mark that has nothing to do with it; claiming that mark instead
    // would swallow a layer the reader should have.
    expect(treeComposite([
      markGroup(document, 'link', [null]),
      markGroup(document, 'dot', paths),
      markGroup(document, 'text', paths),
      // One title it shares with the tree and one it does not. A mark has to
      // be titled from these nodes throughout to be their names; overlapping
      // in part is what a chart drawn over a tree does.
      markGroup(document, 'text', ['/a', 'q']),
      // And no titles at all is not evidence either: a `Plot.text` scatter
      // labelled from its content alone would be swallowed whole.
      markGroup(document, 'text', [null, null]),
    ])).toEqual({ link: 0, dot: 1, texts: [2] });
  });

  it('needs the edges drawn before the nodes, as Plot draws them', () => {
    // Plot expands a tree into link, dot, text, text in one place and in that
    // order. A link that comes after the nodes belongs to something else, and
    // claiming it would leave the tree's own edges to be read as spans.
    expect(treeComposite([
      markGroup(document, 'dot', paths),
      markGroup(document, 'text', paths),
      markGroup(document, 'link', [null]),
    ])).toBeNull();
  });

  it('reads the tree when all three hold', () => {
    // The control: the same shape with nothing missing is claimed, so the
    // three refusals above are about what they say they are.
    expect(treeComposite([
      markGroup(document, 'link', [null, null]),
      markGroup(document, 'dot', paths),
      markGroup(document, 'text', paths),
    ])).toEqual({ link: 0, dot: 1, texts: [2] });
  });
});
