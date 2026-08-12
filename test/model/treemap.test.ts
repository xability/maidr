import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { TreemapTrace } from '@model/treemap';
import { TraceType } from '@type/grammar';

/**
 * Two continents and their countries, with only the leaves declared.
 *
 * Europe totals 150 and Asia 1577, and neither is declared -- a treemap draws
 * its leaves, so a producer emitting only them is the ordinary case rather
 * than a degenerate one. The two subtrees are also deliberately different
 * sizes, so a step that leaves one and lands in the other is visible in the
 * address rather than only in the name.
 */
const NATIONS: TreemapPoint[] = [
  { x: 'France', y: 67, path: ['Europe'] },
  { x: 'Germany', y: 83, path: ['Europe'] },
  { x: 'Japan', y: 125, path: ['Asia'] },
  { x: 'India', y: 1400, path: ['Asia'] },
  { x: 'Korea', y: 52, path: ['Asia'] },
];

/**
 * Create a minimal treemap layer for model-only tests.
 * @param data The nodes the layer carries
 * @returns Treemap layer definition
 */
function createLayer(data: TreemapPoint[] = NATIONS): MaidrLayer {
  return {
    id: 'test-treemap-layer',
    type: TraceType.TREEMAP,
    title: 'Population by region',
    axes: { x: { label: 'Region' }, y: { label: 'Population' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: TreemapTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a treemap trace sitting on its first top-level node.
 * @param data The nodes the layer carries
 * @returns The entered trace
 */
function treemap(data: TreemapPoint[] = NATIONS): TreemapTrace {
  const trace = TraceFactory.create(createLayer(data)) as TreemapTrace;
  // The first move is the initial entry, which lands on the first node
  // rather than moving from it.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Walk a sequence of moves and report where each one landed.
 * @param trace The trace to drive
 * @param directions The moves to make
 * @returns The name announced after each move, or null where it was refused
 */
function walk(trace: TreemapTrace, ...directions: MovableDirection[]): (string | null)[] {
  return directions.map((direction) => {
    if (!trace.moveOnce(direction)) {
      return null;
    }
    return String(nonEmptyState(trace).text.main.value);
  });
}

/**
 * Read a description stat by label.
 * @param label The stat to find
 * @param data The nodes the layer carries
 * @returns Its value, or undefined
 */
function stat(label: string, data: TreemapPoint[] = NATIONS): unknown {
  return treemap(data).description.stats.find(entry => entry.label === label)?.value;
}

describe('treemap registration', () => {
  test('the factory builds a TreemapTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(TreemapTrace);
  });

  test('it names itself a treemap', () => {
    expect(treemap().description.chartType).toBe('Treemap');
  });

  test('entry lands on the first top-level node', () => {
    expect(nonEmptyState(treemap()).text.main.value).toBe('Europe');
  });
});

describe('the hierarchy is built from the paths', () => {
  test('an interior node nobody declared still exists', () => {
    // A treemap draws its leaves. A reader who can only reach the five
    // countries has been given a list, which is the chart MAIDR could
    // already read and the one this trace exists to replace.
    expect(walk(treemap(), 'FORWARD')).toEqual(['Asia']);
  });

  test('a derived node totals its children', () => {
    expect(nonEmptyState(treemap()).text.cross.value).toBe(150);
  });

  test('a declared total is kept even where the children disagree', () => {
    // A parent may carry mass no child accounts for -- an "other" remainder
    // the layout draws and the leaves do not name. Correcting it to the sum
    // would be inventing data.
    const declared: TreemapPoint[] = [
      { x: 'Europe', y: 200 },
      ...NATIONS,
    ];

    expect(nonEmptyState(treemap(declared)).text.cross.value).toBe(200);
  });

  test('a leaf declared with no path is a top-level node', () => {
    const flat: TreemapPoint[] = [{ x: 'Alone', y: 5 }];

    expect(nonEmptyState(treemap(flat)).text.main.value).toBe('Alone');
  });
});

describe('the arrow keys move through the tree, not across a grid', () => {
  test('down enters the first child and up returns to the parent', () => {
    expect(walk(treemap(), 'DOWNWARD', 'UPWARD')).toEqual(['France', 'Europe']);
  });

  test('left and right walk the siblings', () => {
    expect(walk(treemap(), 'DOWNWARD', 'FORWARD', 'BACKWARD'))
      .toEqual(['France', 'Germany', 'France']);
  });

  test('right stops at the last sibling rather than entering a cousin', () => {
    // Germany is at depth 1, index 1; Japan is at depth 1, index 2. On a flat
    // grid this step lands on Japan and announces it as though it followed
    // Germany -- which is a step from one continent into another, unannounced.
    // The tree is what says the two are not neighbours.
    expect(walk(treemap(), 'DOWNWARD', 'FORWARD', 'FORWARD'))
      .toEqual(['France', 'Germany', null]);
  });

  test('a cousin is reached the way a tree is walked', () => {
    expect(walk(treemap(), 'DOWNWARD', 'FORWARD', 'UPWARD', 'FORWARD', 'DOWNWARD'))
      .toEqual(['France', 'Germany', 'Europe', 'Asia', 'Japan']);
  });

  test('up from a top-level node is refused rather than wrapped', () => {
    expect(walk(treemap(), 'UPWARD')).toEqual([null]);
  });

  test('down from a leaf is refused', () => {
    expect(walk(treemap(), 'DOWNWARD', 'DOWNWARD')).toEqual(['France', null]);
  });
});

describe('the extremes move along the same two axes', () => {
  /**
   * Drive a jump-to-extreme and report where it landed.
   * @param trace The trace to drive
   * @param direction Which extreme
   * @returns The name announced, or null where the jump was refused
   */
  function jump(trace: TreemapTrace, direction: MovableDirection): string | null {
    if (!trace.moveToExtreme(direction)) {
      return null;
    }
    return String(nonEmptyState(trace).text.main.value);
  }

  test('up jumps out to the top of the branch', () => {
    const trace = treemap();
    walk(trace, 'FORWARD', 'DOWNWARD', 'FORWARD');

    expect(jump(trace, 'UPWARD')).toBe('Asia');
  });

  test('down jumps in to the end of the first line of descent', () => {
    const deep: TreemapPoint[] = [
      { x: 'Paris', y: 2, path: ['Europe', 'France'] },
      { x: 'Lyon', y: 1, path: ['Europe', 'France'] },
    ];
    const trace = treemap(deep);

    expect(jump(trace, 'DOWNWARD')).toBe('Paris');
  });

  test('right jumps to the last sibling and stops there', () => {
    const trace = treemap();
    walk(trace, 'DOWNWARD');

    // Germany, the last of Europe's two children -- not Korea, the last entry
    // of depth 1. The extreme has to respect the same boundary the single
    // step does, which is the gap the hexbin and survival traces both had.
    //
    // Driven from Europe rather than from Asia deliberately: Asia's last
    // child *is* the last node of its level, so a jump made from there
    // returns the same answer whether or not the boundary is respected.
    expect(jump(trace, 'FORWARD')).toBe('Germany');
  });

  test('left jumps to the first sibling', () => {
    const trace = treemap();
    walk(trace, 'FORWARD', 'DOWNWARD', 'FORWARD', 'FORWARD');

    expect(jump(trace, 'BACKWARD')).toBe('Japan');
  });
});

describe('a node is announced with its place in the tree', () => {
  test('a top-level node carries its share of the whole', () => {
    expect(nonEmptyState(treemap()).text.asides).toEqual([
      { label: 'Share of total', value: '8.7%' },
      { label: 'Children', value: '2' },
    ]);
  });

  test('a child carries its share of its parent, which is what the area shows', () => {
    // The comparison the rectangles are drawn to support, and the one a
    // sighted reader estimates worst. The parent is named in the label, so
    // terse mode -- which drops aside labels -- still says which whole the
    // percentage is of.
    const trace = treemap();
    walk(trace, 'DOWNWARD');

    expect(nonEmptyState(trace).text.asides)
      .toEqual([{ label: 'Share of Europe', value: '44.7%' }]);
  });

  test('the breadcrumb appears once the parent alone stops locating you', () => {
    const deep: TreemapPoint[] = [
      { x: 'Paris', y: 2, path: ['World', 'Europe', 'France'] },
    ];
    const trace = treemap(deep);
    walk(trace, 'DOWNWARD', 'DOWNWARD', 'DOWNWARD');

    expect(nonEmptyState(trace).text.asides?.[0])
      .toEqual({ label: 'Path', value: 'World > Europe > France' });
  });

  test('a leaf says nothing about children rather than saying none', () => {
    const trace = treemap();
    walk(trace, 'DOWNWARD');

    expect(nonEmptyState(trace).text.asides?.map(aside => aside.label))
      .not
      .toContain('Children');
  });
});

describe('the description answers what a walk cannot', () => {
  test('counts the levels and the nodes, derived ones included', () => {
    expect(stat('Levels')).toBe(2);
    expect(stat('Number of nodes')).toBe(7);
    expect(stat('Number of leaves')).toBe(5);
  });

  test('totals the tree', () => {
    expect(stat('Total')).toBe(1727);
  });

  test('breaks the top level down, which the layout shows at a glance', () => {
    expect(stat('Top level')).toBe('Europe 8.7%, Asia 91.3%');
  });

  test('names the largest leaf with its branch', () => {
    // A leaf's name alone does not say which branch it is the largest thing
    // in, and on a hierarchy that is most of the finding.
    expect(stat('Largest leaf')).toBe('Asia > India, 1400');
  });

  test('the data table carries the path, so the tree survives flattening', () => {
    const { headers, rows } = treemap().description.dataTable;

    expect(headers).toEqual(['Path', 'Region', 'Population', 'Share of total']);
    expect(rows[0]).toEqual(['', 'Europe', 150, '8.7%']);
    expect(rows[2]).toEqual(['Europe', 'France', 67, '3.9%']);
  });
});

describe('the modalities read the tree by depth', () => {
  test('pitch is scaled within the level, not across the tree', () => {
    // A tree's magnitudes fall by an order of magnitude per level. Scaled
    // across the whole of this chart, France and Germany would both sit at
    // the floor of a range topped by Asia's 1577 and be indistinguishable --
    // and the level a reader is walking is the one they are comparing.
    const trace = treemap();
    walk(trace, 'DOWNWARD');
    const { freq } = nonEmptyState(trace).audio;

    expect(freq).toEqual({ min: 52, max: 1400, raw: 67 });
  });

  test('braille gives one row per level', () => {
    const braille = nonEmptyState(treemap()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.values).toEqual([[150, 1577], [67, 83, 125, 1400, 52]]);
  });
});
