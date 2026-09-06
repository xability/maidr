import type { MaidrLayer, TreemapPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { TreemapTrace } from '@model/treemap';
import { TraceType } from '@type/grammar';

/**
 * What a treemap costs to build.
 *
 * The graph the cursor walks is wired in the constructor, so a reader waits
 * through it before the first announcement — and again on every live-data
 * append, because the controller rebuilds the whole figure. A flat treemap
 * is the shape that hurts: one root with every leaf under it is the layout
 * a disk-usage, word-frequency or market-cap chart arrives in.
 *
 * The cost is pinned by counting rather than timing, so the assertion says
 * what the algorithm does instead of how fast this machine happens to be.
 */

/**
 * A treemap layer over the given nodes.
 * @param data - The nodes the layer carries
 * @returns The layer
 */
function createLayer(data: TreemapPoint[]): MaidrLayer {
  return {
    id: 'test-treemap-layer',
    type: TraceType.TREEMAP,
    title: 'Tree',
    axes: { x: { label: 'Name' }, y: { label: 'Size' } },
    data,
  };
}

/**
 * `count` leaves under a single parent — the flat tree.
 * @param count - How many leaves to hang off the one parent
 * @returns The nodes
 */
function leavesUnderOneParent(count: number): TreemapPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    x: `leaf-${i}`,
    y: i + 1,
    path: ['root'],
  }));
}

/**
 * How many times the body of `build` searches an array with `findIndex`.
 *
 * Each such search reads the whole of a node's sibling list, so one per node
 * is one full pass over the siblings per sibling.
 * @param build - The work to measure
 * @returns The number of `Array.prototype.findIndex` calls it made
 */
function countArraySearches(build: () => void): number {
  const search = jest.spyOn(Array.prototype, 'findIndex');
  try {
    build();
    return search.mock.calls.length;
  } finally {
    search.mockRestore();
  }
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace - The trace to read
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
 * Walk a sequence of moves and report where each one landed.
 * @param trace - The trace to drive
 * @param directions - The moves to make
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
 * Drive a jump-to-extreme and report where it landed.
 * @param trace - The trace to drive
 * @param direction - Which extreme
 * @returns The name announced, or null where the jump was refused
 */
function jump(trace: TreemapTrace, direction: MovableDirection): string | null {
  if (!trace.moveToExtreme(direction)) {
    return null;
  }
  return String(nonEmptyState(trace).text.main.value);
}

describe('the cost of building a treemap', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('does not search a parent\'s children once per child', () => {
    const small = countArraySearches(() => {
      void new TreemapTrace(createLayer(leavesUnderOneParent(40)));
    });
    const large = countArraySearches(() => {
      void new TreemapTrace(createLayer(leavesUnderOneParent(80)));
    });

    // A node's place among its siblings is known when it is added to them,
    // so wiring the graph never looks for it.
    expect(small).toBe(0);
    expect(large).toBe(0);
  });

  test('still steps between siblings and not across subtrees', () => {
    // Correctness first: left and right are siblings, not neighbours at the
    // same depth. Germany and Japan sit side by side on depth 1 under
    // different parents, so right from Germany must be refused.
    const trace = new TreemapTrace(createLayer([
      { x: 'France', y: 67, path: ['Europe'] },
      { x: 'Germany', y: 83, path: ['Europe'] },
      { x: 'Japan', y: 125, path: ['Asia'] },
      { x: 'India', y: 1400, path: ['Asia'] },
    ]));
    trace.moveOnce('FORWARD');

    expect(walk(trace, 'DOWNWARD', 'FORWARD', 'FORWARD')).toEqual([
      'France',
      'Germany',
      null,
    ]);
  });

  test('still puts the ends of a sibling list where the extremes go', () => {
    const trace = new TreemapTrace(createLayer([
      { x: 'Japan', y: 125, path: ['Asia'] },
      { x: 'India', y: 1400, path: ['Asia'] },
      { x: 'Korea', y: 52, path: ['Asia'] },
    ]));
    trace.moveOnce('FORWARD');
    walk(trace, 'DOWNWARD');

    // Out to the last of the siblings, then back to the first.
    expect(jump(trace, 'FORWARD')).toBe('Korea');
    expect(jump(trace, 'BACKWARD')).toBe('Japan');
  });
});
