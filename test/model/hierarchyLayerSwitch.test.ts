import type { Trace } from '@model/plot';
import type { DirectedGraphPoint, MaidrLayer, TreemapPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * Page Up and Page Down between a tree or a graph and another layer of the
 * same chart, as Mermaid's Cynefin framework (a tree of domains and a graph of
 * the transitions between them) and Wardley map (points and a value chain)
 * draw them.
 *
 * Neither the tree nor the graph had an X another layer could find, so a
 * switch lost the reader's domain, and the incoming layer was left unentered:
 * the switch announced its first node, and the first arrow announced it again.
 */

const NOTES: Record<string, string> = {
  Complex: 'Probe → Sense → Respond, Emergent Practices',
  Complicated: 'Sense → Analyse → Respond, Good Practices',
  Clear: 'Sense → Categorise → Respond, Best Practices',
  Chaotic: 'Act → Sense → Respond, Novel Practices',
};

/** The tree Mermaid's Cynefin page becomes: each domain with its note. */
const DOMAINS: TreemapPoint[] = Object.entries(NOTES).flatMap(([name, note]) => [
  { x: `${name} (${note})`, kind: 'Domain' },
  { x: `${name} item`, path: [`${name} (${note})`], kind: 'Item' },
]);

/** The transitions, whose nodes are the domains' bare names. */
const TRANSITIONS: DirectedGraphPoint[] = [
  { id: 'complex', label: 'Complex', inputs: ['chaotic'] },
  { id: 'complicated', label: 'Complicated', inputs: ['complex'] },
  { id: 'clear', label: 'Clear', inputs: ['complicated'] },
  { id: 'chaotic', label: 'Chaotic' },
];

function figure(...layers: MaidrLayer[]): Figure {
  return new Figure({ id: 'chart', subplots: [[{ layers }]] });
}

const tree = (data: TreemapPoint[] = DOMAINS): MaidrLayer => ({ id: 'tree', type: TraceType.TREE, data });
function graph(data: DirectedGraphPoint[] = TRANSITIONS): MaidrLayer {
  return { id: 'graph', type: TraceType.DIRECTED_GRAPH, data };
}

function named(trace: Trace | null): unknown {
  const state = trace?.state;
  if (state === undefined || state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text.main.value;
}

describe('a Cynefin framework\'s domains and transitions', () => {
  test('a switch keeps the reader on the domain they were on, both ways', () => {
    const chart = figure(tree(), graph());
    const subplot = chart.activeSubplot;
    const domains = subplot.activeTrace;
    domains?.moveOnce('FORWARD');
    domains?.moveOnce('FORWARD');
    domains?.moveOnce('FORWARD');
    expect(named(domains)).toBe(`Clear (${NOTES.Clear})`);

    const transitions = subplot.switchLayer('UPWARD');
    expect(named(transitions)).toBe('Clear');
    expect(transitions?.isInitialEntry).toBe(false);

    transitions?.moveOnce('BACKWARD');
    expect(named(transitions)).toBe('Complicated');

    expect(named(subplot.switchLayer('DOWNWARD'))).toBe(`Complicated (${NOTES.Complicated})`);
  });

  test('the description\'s layer tabs carry the domain too', () => {
    const subplot = figure(tree(), graph()).activeSubplot;
    subplot.activeTrace?.moveOnce('FORWARD');
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(named(subplot.selectLayer(1))).toBe('Complicated');
  });

  test('an item, which the other layer does not draw, enters it at its first domain', () => {
    const subplot = figure(tree(), graph()).activeSubplot;
    const domains = subplot.activeTrace;
    domains?.moveOnce('FORWARD');
    domains?.moveOnce('DOWNWARD');
    expect(named(domains)).toBe('Complex item');

    const transitions = subplot.switchLayer('UPWARD');

    expect(transitions?.isInitialEntry).toBe(false);
    const announced = named(transitions);
    transitions?.moveOnce('FORWARD');
    expect(named(transitions)).not.toBe(announced);
  });
});

describe('a layer the position cannot be carried into is entered where the switch says', () => {
  test('points to a graph: the first arrow moves rather than repeating the node', () => {
    const subplot = figure(
      { id: 'points', type: TraceType.SCATTER, data: [{ x: 0.35, y: 0.43 }, { x: 0.61, y: 0.79 }] },
      graph(),
    ).activeSubplot;
    subplot.activeTrace?.moveOnce('FORWARD');

    const transitions = subplot.switchLayer('UPWARD');
    const announced = named(transitions);

    expect(transitions?.isInitialEntry).toBe(false);
    expect(transitions?.moveOnce('FORWARD')).toBe(true);
    expect(named(transitions)).not.toBe(announced);
  });

  test('bars to a tree: the first arrow moves rather than repeating the node', () => {
    const subplot = figure(
      { id: 'bars', type: TraceType.BAR, data: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
      tree(),
    ).activeSubplot;
    subplot.activeTrace?.moveOnce('FORWARD');

    const domains = subplot.switchLayer('UPWARD');
    const announced = named(domains);

    expect(domains?.isInitialEntry).toBe(false);
    domains?.moveOnce('FORWARD');
    expect(named(domains)).not.toBe(announced);
  });
});

test('of two nodes sharing a name, a round trip returns to the one the reader was on', () => {
  const subplot = figure(
    tree([
      { x: 'A' },
      { x: 'Other', path: ['A'] },
      { x: 'B' },
      { x: 'Other', path: ['B'] },
    ]),
    graph([{ id: 'other', label: 'Other' }, { id: 'more', label: 'More', inputs: ['other'] }]),
  ).activeSubplot;
  const domains = subplot.activeTrace;
  domains?.moveOnce('FORWARD');
  domains?.moveOnce('FORWARD');
  domains?.moveOnce('DOWNWARD');
  const left = [domains?.row, domains?.col];
  expect(named(domains)).toBe('Other');

  expect(named(subplot.switchLayer('UPWARD'))).toBe('Other');
  subplot.switchLayer('DOWNWARD');

  expect([domains?.row, domains?.col]).toEqual(left);
});

test('a layer with no X never matches a node named "null"', () => {
  const subplot = figure(tree([{ x: 'null' }, { x: 'Real' }]), graph()).activeSubplot;

  expect(subplot.activeTrace?.moveToXValue(null as never)).toBe(false);
});
