import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { NotificationService } from '@service/notification';
import { TextService } from '@service/text';
import { TraceType } from '@type/grammar';

/**
 * What terse mode keeps of an aside whose value means nothing alone.
 *
 * Terse mode drops every aside label on purpose (see mosaicText.test.ts), and
 * for most asides the value says what it is. A treemap's share of its parent
 * names the parent only in its label, so terse mode read "Cloud, 20, 71.4%"
 * -- a share of an unnamed whole, which sounds like the share of the total a
 * top-level node is announced with. A count of children read as a bare
 * number, and a directed graph's From and To lists, joined with the same
 * comma terse puts between clauses, ran into each other and into whatever
 * followed them. A network's neighbours ran on from the node's name the same
 * way, and its group's position after them sounded like the node's own.
 */

/**
 * What a reader hears after the given moves.
 *
 * @param layer - The layer to read
 * @param mode - The verbosity to read in
 * @param moves - Moves after the first, which enters the trace
 * @returns The announcement
 */
function heard(layer: MaidrLayer, mode: 'verbose' | 'terse', moves: MovableDirection[] = []): string {
  const trace = TraceFactory.create(layer);
  trace.moveOnce('FORWARD');
  for (const move of moves) {
    trace.moveOnce(move);
  }
  const text = new TextService(new NotificationService());
  if (mode === 'terse') {
    text.toggle();
  }
  return text.format(trace.state);
}

const NATIONS: TreemapPoint[] = [
  { x: 'France', y: 67, path: ['Europe'] },
  { x: 'Germany', y: 83, path: ['Europe'] },
  { x: 'Paris', y: 2, path: ['Europe', 'France'] },
  { x: 'Japan', y: 125, path: ['Asia'] },
  { x: 'India', y: 1400, path: ['Asia'] },
];

const TREE: MaidrLayer = {
  id: 'nations',
  type: TraceType.TREEMAP,
  title: 'Population by region',
  axes: { x: { label: 'Region' }, y: { label: 'Population' } },
  data: NATIONS,
};

/**
 * Ana, Ben, Chloe and Dev in one group, Chloe the most connected, and Eli and
 * Fay in another: the Graphviz network example.
 */
const TEAM: MaidrLayer = {
  id: 'team',
  type: TraceType.NETWORK,
  title: 'Who reviews whose code',
  axes: { x: { label: 'Person' }, y: { label: 'Links' } },
  data: [
    { source: 'Ana', target: 'Chloe' },
    { source: 'Ben', target: 'Chloe' },
    { source: 'Chloe', target: 'Dev' },
    { source: 'Ana', target: 'Ben' },
    { source: 'Eli', target: 'Fay' },
  ],
};

/** received -> stock -> (supplier -> pack), (pack) -> ship */
const FLOW: MaidrLayer = {
  id: 'orders',
  type: TraceType.DIRECTED_GRAPH,
  title: 'Orders',
  axes: { x: { label: 'Step' } },
  data: [
    { id: 'received', label: 'Order received' },
    { id: 'stock', label: 'In stock?', inputs: ['received'] },
    { id: 'supplier', label: 'Order from supplier', inputs: ['stock'] },
    { id: 'pack', label: 'Pick and pack', inputs: ['stock', 'supplier'] },
    { id: 'ship', label: 'Ship', inputs: ['pack'] },
  ],
} as MaidrLayer;

describe('a treemap in terse mode', () => {
  test('a top-level node says its share of the whole and how many children it has', () => {
    expect(heard(TREE, 'terse')).toBe('Europe, 150, 9.0%, 2 children');
  });

  test('a child says which whole its share is of', () => {
    // "France, 67, 44.7%" before: the same bare percentage a top-level node
    // is announced with, of a parent nobody named.
    expect(heard(TREE, 'terse', ['DOWNWARD'])).toBe('France, 67, 44.7% of Europe, 1 child');
  });

  test('a grandchild says where it is', () => {
    expect(heard(TREE, 'terse', ['DOWNWARD', 'DOWNWARD']))
      .toBe('Paris, 2, in Europe > France, 3.0% of France');
  });

  test('verbose mode reads as it did', () => {
    expect(heard(TREE, 'verbose', ['DOWNWARD']))
      .toBe('Region is France, Population is 67, Share of Europe is 44.7%, Children is 1');
  });
});

describe('a directed graph in terse mode', () => {
  test('keeps a node\'s inputs apart from its outputs', () => {
    const spoken = heard(FLOW, 'terse', ['FORWARD', 'FORWARD', 'FORWARD']);

    expect(spoken).toBe(
      'Pick and pack, 2 inputs, 1 output, merge point, '
      + 'from In stock?, Order from supplier, to Ship, 4 of 5',
    );
  });

  test('verbose mode reads as it did', () => {
    const spoken = heard(FLOW, 'verbose', ['FORWARD', 'FORWARD', 'FORWARD']);

    expect(spoken).toContain('From is In stock?, Order from supplier, To is Ship');
  });

  test('a node inside a scope says it is in it', () => {
    const scoped = {
      ...FLOW,
      data: [
        { id: 'a', label: 'Browser' },
        { id: 'b', label: 'API', path: ['Backend'], inputs: ['a'] },
      ],
    } as MaidrLayer;

    expect(heard(scoped, 'terse', ['FORWARD', 'DOWNWARD'])).toMatch(/^API, in Backend, 1 input, /);
  });
});

describe('a network in terse mode', () => {
  test('keeps the neighbours apart from the name, and the group from the neighbours', () => {
    // "Ana, 2, Chloe, Ben, 1 of 2, 4 nodes" before: the neighbours ran on
    // from Ana's own name, and the group's position from the last of them,
    // where it sounded like Ana's.
    expect(heard(TEAM, 'terse', ['FORWARD'])).toBe('Ana, 2, linked to Chloe, Ben, group 1 of 2, 4 nodes');
  });

  test('verbose mode reads as it did', () => {
    expect(heard(TEAM, 'verbose', ['FORWARD']))
      .toBe('Person is Ana, Links is 2, Linked to is Chloe, Ben, Group is 1 of 2, 4 nodes');
  });
});
