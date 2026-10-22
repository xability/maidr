import type { Trace } from '@model/plot';
import type { DirectedGraphPoint, MaidrLayer, ScatterPoint, TreemapPoint } from '@type/grammar';
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

/**
 * Mermaid's Wardley map: the components placed by evolution and visibility,
 * each a point named for it, and their value chain, a graph of the same
 * components. A component with a note carries it in parentheses.
 */
const COMPONENTS: ScatterPoint[] = [
  { x: 0.63, y: 0.95, label: 'Business (anchor)' },
  { x: 0.61, y: 0.79, label: 'Cup of Tea' },
  { x: 0.81, y: 0.63, label: 'Tea' },
  { x: 0.8, y: 0.52, label: 'Hot Water' },
  { x: 0.35, y: 0.43, label: 'Kettle (evolving to 0.62)' },
  { x: 0.7, y: 0.1, label: 'Power' },
];

const VALUE_CHAIN: DirectedGraphPoint[] = [
  { id: 'business', label: 'Business' },
  { id: 'cup', label: 'Cup of Tea', inputs: ['business'] },
  { id: 'tea', label: 'Tea', inputs: ['cup'] },
  { id: 'water', label: 'Hot Water', inputs: ['cup'] },
  { id: 'kettle', label: 'Kettle', inputs: ['water'] },
  { id: 'power', label: 'Power', inputs: ['kettle'] },
];

function components(data: ScatterPoint[] = COMPONENTS): MaidrLayer {
  return { id: 'map', type: TraceType.SCATTER, data };
}

/** The name the scatter announces for the point it is on, if any. */
function pointName(trace: Trace | null): string | undefined {
  const state = trace?.state;
  if (state === undefined || state.empty) {
    throw new Error('expected a populated trace state');
  }
  return state.text.asides?.find(aside => aside.label === 'Name')?.value;
}

describe('a Wardley map\'s components and value chain', () => {
  test('a switch keeps the reader on the component they were on, both ways', () => {
    const subplot = figure(components(), graph(VALUE_CHAIN)).activeSubplot;
    const map = subplot.activeTrace;
    map?.moveOnce('FORWARD'); // Kettle, the least evolved.
    map?.moveOnce('FORWARD'); // Cup of Tea.
    expect(pointName(map)).toBe('Cup of Tea');

    const chain = subplot.switchLayer('UPWARD');
    expect(named(chain)).toBe('Cup of Tea');

    chain?.moveOnce('FORWARD'); // Tea.
    chain?.moveOnce('FORWARD'); // Hot Water.
    expect(named(chain)).toBe('Hot Water');

    expect(pointName(subplot.switchLayer('DOWNWARD'))).toBe('Hot Water');
  });

  test('a component with a note is found by its name alone, both ways', () => {
    const subplot = figure(components(), graph(VALUE_CHAIN)).activeSubplot;
    subplot.activeTrace?.moveOnce('FORWARD');
    expect(pointName(subplot.activeTrace)).toBe('Kettle (evolving to 0.62)');

    const chain = subplot.switchLayer('UPWARD');
    expect(named(chain)).toBe('Kettle');

    chain?.moveOnce('BACKWARD'); // Hot Water.
    chain?.moveOnce('BACKWARD'); // Tea.
    chain?.moveOnce('BACKWARD'); // Cup of Tea.
    chain?.moveOnce('BACKWARD'); // Business.
    expect(named(chain)).toBe('Business');

    expect(pointName(subplot.switchLayer('DOWNWARD'))).toBe('Business (anchor)');
  });

  test('the description\'s layer tabs carry the component too', () => {
    const subplot = figure(components(), graph(VALUE_CHAIN)).activeSubplot;
    subplot.activeTrace?.moveOnce('FORWARD');

    expect(named(subplot.selectLayer(1))).toBe('Kettle');
  });

  test('two components at one evolution: the switch lands on their column', () => {
    // The column holds both and names neither, so the map offers no name;
    // from the chain the column is found by either one.
    const shared: ScatterPoint[] = [
      { x: 0.35, y: 0.43, label: 'Kettle' },
      { x: 0.8, y: 0.52, label: 'Hot Water' },
      { x: 0.8, y: 0.63, label: 'Tea' },
    ];
    const subplot = figure(components(shared), graph(VALUE_CHAIN)).activeSubplot;
    const map = subplot.activeTrace;
    map?.moveOnce('FORWARD');
    map?.moveOnce('FORWARD');
    expect(pointName(map)).toBeUndefined();
    expect(named(subplot.switchLayer('UPWARD'))).toBe('Business');
    subplot.activeTrace?.moveOnce('FORWARD'); // Cup of Tea, on no map point.
    subplot.activeTrace?.moveOnce('FORWARD'); // Tea.
    subplot.activeTrace?.moveOnce('FORWARD'); // Hot Water.
    subplot.activeTrace?.moveOnce('FORWARD'); // Kettle.
    expect(pointName(subplot.switchLayer('DOWNWARD'))).toBe('Kettle');
    const chain = subplot.switchLayer('UPWARD');
    chain?.moveOnce('BACKWARD'); // Hot Water.
    chain?.moveOnce('BACKWARD'); // Tea.
    expect(named(chain)).toBe('Tea');

    const back = subplot.switchLayer('DOWNWARD');

    expect(back?.getCurrentXValue()).toBe(0.8);
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
