import type { MaidrLayer, NetworkPoint } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { NetworkTrace } from '@model/network';
import { TraceType } from '@type/grammar';

/**
 * A collaboration graph in two disconnected halves, plus a node linked to
 * nobody.
 *
 * The split is the point: following links from anywhere in the first half
 * never reaches the second, so a reading whose arrows follow edges would leave
 * two thirds of this chart unreachable and never say so.
 *
 * Degrees: Ada 4, Grace 2, Alan 2, Edsger 1, Barbara 1 -- then Tim 1, Vint 1
 * in the second group, and Ida alone.
 */
const COLLAB: NetworkPoint[] = [
  { source: 'Edsger', target: 'Ada' },
  { source: 'Ada', target: 'Grace' },
  { source: 'Ada', target: 'Alan' },
  { source: 'Grace', target: 'Alan' },
  { source: 'Barbara', target: 'Ada' },
  { source: 'Tim', target: 'Vint' },
  { source: 'Ida', target: 'Ida' },
];

/**
 * Create a minimal network layer for model-only tests.
 * @param data The links the layer carries
 * @returns Network layer definition
 */
function createLayer(data: NetworkPoint[] = COLLAB): MaidrLayer {
  return {
    id: 'test-network-layer',
    type: TraceType.NETWORK,
    title: 'Collaborations',
    axes: { x: { label: 'Person' }, y: { label: 'Links' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: NetworkTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a network trace sitting on its first node.
 * @param data The links the layer carries
 * @returns The entered trace
 */
function network(data: NetworkPoint[] = COLLAB): NetworkTrace {
  const trace = TraceFactory.create(createLayer(data)) as NetworkTrace;
  // The first move is the initial entry, which lands rather than moves.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Walk a sequence of moves and report the node each one landed on.
 * @param trace The trace to drive
 * @param directions The moves to make
 * @returns The node announced after each move, or null where it was refused
 */
function walk(trace: NetworkTrace, ...directions: MovableDirection[]): (string | null)[] {
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
 * @param data The links the layer carries
 * @returns Its value, or undefined
 */
function stat(label: string, data: NetworkPoint[] = COLLAB): unknown {
  return network(data).description.stats.find(entry => entry.label === label)?.value;
}

describe('network registration', () => {
  test('the factory builds a NetworkTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(NetworkTrace);
  });

  test('it names itself a network', () => {
    expect(network().description.chartType).toBe('Network Diagram');
  });

  test('links are undirected, so a degree counts both ends', () => {
    // Ada is named as the source twice and the target twice; she has four
    // distinct collaborators. Reading the links one way would halve every
    // degree on the chart.
    expect(nonEmptyState(network()).text.main.value).toBe('Ada');
    expect(nonEmptyState(network()).text.cross.value).toBe(4);
  });

  test('a link declared both ways counts once', () => {
    // Several libraries emit an undirected edge as a pair, and counting it
    // twice would report a degree the picture does not show.
    const doubled: NetworkPoint[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'A' },
    ];

    expect(nonEmptyState(network(doubled)).text.cross.value).toBe(1);
  });

  test('a self-link is not a connection to anyone', () => {
    expect(stat('Number of links')).toBe(6);
  });
});

describe('the arrows reach every node, which following links cannot', () => {
  test('left and right walk this group, most connected first', () => {
    // Ada 4, then Grace and Alan at 2. Arriving on the hub is the point:
    // it is the finding this chart is usually drawn for.
    expect(walk(network(), 'FORWARD', 'FORWARD')).toEqual(['Grace', 'Alan']);
  });

  test('up moves to another group entirely', () => {
    // The guarantee that matters. Following links from Ada reaches four
    // people and never Tim, Vint or Ida -- an arrow that followed edges
    // would leave two thirds of this chart unreachable and say nothing.
    expect(walk(network(), 'UPWARD')).toEqual(['Tim']);
  });

  test('every node is reachable with the arrows alone', () => {
    const trace = network();
    const seen = new Set<string>([String(nonEmptyState(trace).text.main.value)]);

    for (let group = 0; group < 3; group++) {
      for (;;) {
        const at = walk(trace, 'FORWARD')[0];
        if (at === null) {
          break;
        }
        seen.add(at);
      }
      if (walk(trace, 'UPWARD')[0] === null) {
        break;
      }
      seen.add(String(nonEmptyState(trace).text.main.value));
    }

    expect([...seen].sort())
      .toEqual(['Ada', 'Alan', 'Barbara', 'Edsger', 'Grace', 'Ida', 'Tim', 'Vint']);
  });

  test('down from the first group is refused rather than wrapped', () => {
    expect(walk(network(), 'DOWNWARD')).toEqual([null]);
  });

  test('a move between groups lands on that group rather than on nothing', () => {
    // Ida's group holds one node, so a move that kept the column would land
    // outside it.
    const trace = network();
    walk(trace, 'FORWARD', 'FORWARD', 'FORWARD');

    expect(walk(trace, 'UPWARD', 'UPWARD')).toEqual(['Tim', 'Ida']);
  });
});

describe('degree is the announcement, and position is never mentioned', () => {
  test('a node names how many it is linked to, and to whom', () => {
    expect(nonEmptyState(network()).text.asides?.[0])
      .toEqual({ label: 'Links', value: '4, to Grace, Alan, Edsger and 1 more' });
  });

  test('an isolated node says so rather than saying nothing', () => {
    const trace = network();
    walk(trace, 'UPWARD', 'UPWARD');

    expect(nonEmptyState(trace).text.asides?.[0])
      .toEqual({ label: 'Links', value: 'none' });
  });

  test('a reader is told which group they are in and how big it is', () => {
    // Without it a reader walking one group has no way to tell whether the
    // chart is that group or one of several.
    expect(nonEmptyState(network()).text.asides)
      .toContainEqual({ label: 'Group', value: '1 of 3, 5 nodes' });
  });

  test('a single-group chart says nothing about groups', () => {
    const one: NetworkPoint[] = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];

    expect(nonEmptyState(network(one)).text.asides?.map(aside => aside.label))
      .not
      .toContain('Group');
  });
});

describe('the rotor is where following a link lives', () => {
  test('it steps through the links of one node', () => {
    const trace = network();
    const visited: string[] = [];
    while (trace.moveToRotorFilter('links', 'right')) {
      visited.push(String(nonEmptyState(trace).text.main.value));
      if (visited.length > 6) {
        break;
      }
    }

    expect(visited).toEqual(['Grace', 'Alan', 'Edsger', 'Barbara']);
  });

  test('it walks back the way it came', () => {
    const trace = network();
    trace.moveToRotorFilter('links', 'right');
    trace.moveToRotorFilter('links', 'right');

    expect(trace.moveToRotorFilter('links', 'left')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('Grace');
  });

  test('walking away with the arrows re-anchors on where you now are', () => {
    const trace = network();
    trace.moveToRotorFilter('links', 'right');
    walk(trace, 'FORWARD');

    // Alan, whose own links are Ada and Grace.
    expect(trace.moveToRotorFilter('links', 'right')).toBe(true);
    expect(['Ada', 'Grace'])
      .toContain(String(nonEmptyState(trace).text.main.value));
  });

  test('it is withheld on a chart where nothing is linked', () => {
    const alone: NetworkPoint[] = [{ source: 'A', target: 'A' }];
    const keys = network(alone).getRotorFilterUnits().map(unit => unit.key);

    expect(keys).not.toContain('links');
  });
});

describe('the description answers what a walk cannot', () => {
  test('counts the nodes, the links and the groups', () => {
    expect(stat('Number of nodes')).toBe(8);
    expect(stat('Number of links')).toBe(6);
    expect(stat('Separate groups')).toBe(3);
  });

  test('names the hubs, which is usually why the chart was drawn', () => {
    expect(String(stat('Most connected'))).toMatch(/^Ada 4, /);
  });

  test('reports how the chart breaks up', () => {
    // Structure a reader following links can never discover, because links
    // do not cross between groups -- which is what makes them groups.
    expect(stat('Group sizes')).toBe('5, 2, 1');
  });

  test('names the nodes that are linked to nothing', () => {
    expect(stat('Unconnected')).toBe('1: Ida');
  });
});

describe('the modalities read degree on one scale', () => {
  test('pitch is scaled across the whole chart, not per group', () => {
    // A hub of three and a hub of thirty have to sound different, and that
    // is the comparison this chart exists for.
    const trace = network();
    walk(trace, 'UPWARD');
    const { freq } = nonEmptyState(trace).audio;

    expect(freq).toEqual({ min: 0, max: 4, raw: 1 });
  });

  test('braille gives one row per group', () => {
    const braille = nonEmptyState(network()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.values).toEqual([[4, 2, 2, 1, 1], [1, 1], [0]]);
  });
});
