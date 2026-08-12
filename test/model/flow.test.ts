import type { FlowPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { FlowTrace } from '@model/flow';
import { TraceType } from '@type/grammar';

/**
 * An energy flow, which is what a sankey is usually drawn for.
 *
 * Coal is the largest source and splits three ways; Gas is smaller and feeds
 * the same middle. The two middle nodes both reach Homes, so the graph is not
 * a tree -- which matters, because a tree would let the treemap read it.
 *
 * Stages: {Coal, Gas} -> {Losses, Electricity, Heat} -> {Homes, Industry}.
 * Losses is one hop from Coal, so it sits in the middle column rather than at
 * the end -- a sink lands wherever its longest inbound path leaves it.
 */
const ENERGY: FlowPoint[] = [
  // Coal's three flows are declared smallest first, deliberately: a fixture
  // that declared them largest first could not tell "follow the widest
  // ribbon" from "follow the first one authored".
  { source: 'Coal', target: 'Losses', value: 8 },
  { source: 'Coal', target: 'Electricity', value: 34 },
  { source: 'Coal', target: 'Heat', value: 14 },
  { source: 'Gas', target: 'Electricity', value: 12 },
  { source: 'Gas', target: 'Heat', value: 6 },
  { source: 'Electricity', target: 'Homes', value: 30 },
  { source: 'Electricity', target: 'Industry', value: 16 },
  { source: 'Heat', target: 'Homes', value: 20 },
];

/**
 * Create a minimal flow layer for model-only tests.
 * @param data The flows the layer carries
 * @param type Which of the three layouts the layer declares
 * @returns Flow layer definition
 */
function createLayer(
  data: FlowPoint[] = ENERGY,
  type: TraceType = TraceType.SANKEY,
): MaidrLayer {
  return {
    id: 'test-flow-layer',
    type,
    title: 'Energy flow',
    axes: { x: { label: 'Node' }, y: { label: 'Petajoules' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: FlowTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a flow trace sitting on its first node.
 * @param data The flows the layer carries
 * @param type Which layout the layer declares
 * @returns The entered trace
 */
function flow(data: FlowPoint[] = ENERGY, type: TraceType = TraceType.SANKEY): FlowTrace {
  const trace = TraceFactory.create(createLayer(data, type)) as FlowTrace;
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
function walk(trace: FlowTrace, ...directions: MovableDirection[]): (string | null)[] {
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
 * @param data The flows the layer carries
 * @returns Its value, or undefined
 */
function stat(label: string, data: FlowPoint[] = ENERGY): unknown {
  return flow(data).description.stats.find(entry => entry.label === label)?.value;
}

describe('flow registration', () => {
  test('the factory builds a FlowTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(FlowTrace);
  });

  test('each layout announces the chart the author drew', () => {
    expect(flow().description.chartType).toBe('Sankey Diagram');
    expect(flow(ENERGY, TraceType.ALLUVIAL).description.chartType)
      .toBe('Alluvial Diagram');
    expect(flow(ENERGY, TraceType.CHORD).description.chartType)
      .toBe('Chord Diagram');
  });

  test('nodes are derived from the flows rather than declared', () => {
    // A flow names both of its ends, so a separate node list would be a
    // second source of truth for something the data already says.
    expect(stat('Number of nodes')).toBe(7);
    expect(stat('Number of flows')).toBe(8);
  });
});

describe('the arrows follow the ribbon', () => {
  test('right follows the largest flow out and left follows it back', () => {
    // Coal splits 34 / 14 / 8, declared 8 first. The widest band is the one
    // an eye follows, so it is the one the arrow takes -- Electricity, not
    // the Losses flow that happens to be authored first.
    expect(walk(flow(), 'FORWARD', 'BACKWARD')).toEqual(['Electricity', 'Coal']);
  });

  test('right keeps following the flow downstream', () => {
    expect(walk(flow(), 'FORWARD', 'FORWARD')).toEqual(['Electricity', 'Homes']);
  });

  test('up and down walk the other nodes of this stage', () => {
    // Gas is the other source; Coal and Gas are the same column of the chart.
    expect(walk(flow(), 'DOWNWARD', 'UPWARD')).toEqual(['Gas', 'Coal']);
  });

  test('a sink refuses to go further downstream', () => {
    const trace = flow();
    walk(trace, 'FORWARD', 'FORWARD');

    expect(walk(trace, 'FORWARD')).toEqual([null]);
  });

  test('a source refuses to go further upstream', () => {
    expect(walk(flow(), 'BACKWARD')).toEqual([null]);
  });
});

describe('the step announces the ribbon it took', () => {
  test('the edge is named with its magnitude and its share', () => {
    // A move announcing only where it landed would withhold the whole content
    // of the step: which flow was taken, how big it is, and what share of the
    // source it carries. 34 of Coal's 56 is 60.7%.
    const trace = flow();
    walk(trace, 'FORWARD');

    expect(nonEmptyState(trace).text.asides?.[0])
      .toEqual({ label: 'Along', value: 'Coal to Electricity, 34, 60.7% of Coal' });
  });

  test('going back names the same ribbon from the other end', () => {
    const trace = flow();
    walk(trace, 'FORWARD', 'BACKWARD');

    expect(nonEmptyState(trace).text.asides?.[0])
      .toEqual({ label: 'Along', value: 'Coal to Electricity, 34, 60.7% of Coal' });
  });

  test('a move within the stage names no ribbon, because none was taken', () => {
    const trace = flow();
    walk(trace, 'DOWNWARD');

    expect(nonEmptyState(trace).text.asides?.map(aside => aside.label))
      .not
      .toContain('Along');
  });

  test('a refused move does not leave the last ribbon announced', () => {
    // The reader is still on the node they were on, and nothing was traversed.
    const trace = flow();
    walk(trace, 'FORWARD', 'FORWARD');
    walk(trace, 'FORWARD');

    expect((nonEmptyState(trace).text.asides ?? []).map(aside => aside.label))
      .not
      .toContain('Along');
  });

  test('a node between two sides reports both', () => {
    const trace = flow();
    walk(trace, 'FORWARD');

    expect(nonEmptyState(trace).text.asides)
      .toContainEqual({ label: 'In and out', value: '46, 46' });
  });

  test('a splitting node says how many ways', () => {
    expect(nonEmptyState(flow()).text.asides)
      .toContainEqual({ label: 'Splits into', value: '3' });
  });
});

describe('the rotor enumerates the flows the arrows skip', () => {
  test('it pages through every outgoing flow of one node', () => {
    // The arrows take the widest band. Everything else is here, and a reader
    // who could only reach the widest one has been shown a path rather than
    // a chart.
    const trace = flow();
    const visited: string[] = [];
    while (trace.moveToRotorFilter('outgoing', 'right')) {
      visited.push(String(nonEmptyState(trace).text.main.value));
      if (visited.length > 6) {
        break;
      }
    }

    expect(visited).toEqual(['Electricity', 'Heat', 'Losses']);
  });

  test('it announces each flow as it steps to it', () => {
    const trace = flow();
    trace.moveToRotorFilter('outgoing', 'right');
    trace.moveToRotorFilter('outgoing', 'right');

    expect(nonEmptyState(trace).text.asides?.[0])
      .toEqual({ label: 'Along', value: 'Coal to Heat, 14, 25.0% of Coal' });
  });

  test('the incoming side walks what feeds a node', () => {
    const trace = flow();
    walk(trace, 'FORWARD');
    const visited: string[] = [];
    while (trace.moveToRotorFilter('incoming', 'right')) {
      visited.push(String(nonEmptyState(trace).text.main.value));
      if (visited.length > 4) {
        break;
      }
    }

    expect(visited).toEqual(['Coal', 'Gas']);
  });

  test('both units are offered where something branches', () => {
    const keys = flow().getRotorFilterUnits().map(unit => unit.key);

    expect(keys).toContain('outgoing');
    expect(keys).toContain('incoming');
  });

  test('neither is offered on a chain, where the arrows already reach all of it', () => {
    const chain: FlowPoint[] = [
      { source: 'A', target: 'B', value: 1 },
      { source: 'B', target: 'C', value: 1 },
    ];
    const keys = flow(chain).getRotorFilterUnits().map(unit => unit.key);

    expect(keys).not.toContain('outgoing');
    expect(keys).not.toContain('incoming');
  });
});

describe('the extremes follow the ribbon to its end', () => {
  test('right jumps to the end of the widest route', () => {
    const trace = flow();

    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('Homes');
  });

  test('left jumps back to where the flow came from', () => {
    const trace = flow();
    walk(trace, 'FORWARD', 'FORWARD');

    expect(trace.moveToExtreme('BACKWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('Coal');
  });

  test('a jump names no single ribbon, because it followed several', () => {
    const trace = flow();
    trace.moveToExtreme('FORWARD');

    // Homes is a sink, so it has no asides at all -- which is still an
    // announcement that names no ribbon.
    expect((nonEmptyState(trace).text.asides ?? []).map(aside => aside.label))
      .not
      .toContain('Along');
  });
});

describe('stages are derived, and a cycle is answered honestly', () => {
  test('a node sits one column past the furthest thing that feeds it', () => {
    // Three columns: the two sources, then what they feed, then what that
    // feeds. Losses is one hop from Coal and therefore sits in the middle
    // column rather than at the end -- a sink is wherever its longest inbound
    // path leaves it, not automatically the last column.
    expect(stat('Stages')).toBe(3);
  });

  test('a chord diagram gets one stage rather than a partial layering', () => {
    // Every node both sends and receives, so nothing sorts.
    const circle: FlowPoint[] = [
      { source: 'A', target: 'B', value: 3 },
      { source: 'B', target: 'C', value: 2 },
      { source: 'C', target: 'A', value: 1 },
    ];

    expect(stat('Stages', circle)).toBe(1);
  });

  test('a graph that is only partly cyclic is not half-layered', () => {
    // The case the pure circle cannot test: there, every node is unsorted and
    // "no stages assigned" happens to equal "one stage", so the fallback and
    // its absence give the same answer.
    //
    // Here a real source feeds a cycle. Without the check, `Source` and the
    // cycle's own members land in different columns and two of the three are
    // announced as though nothing fed them -- a layering that reads as
    // meaningful and is not.
    const tethered: FlowPoint[] = [
      { source: 'Source', target: 'A', value: 5 },
      { source: 'A', target: 'B', value: 3 },
      { source: 'B', target: 'C', value: 2 },
      { source: 'C', target: 'A', value: 1 },
    ];

    expect(stat('Stages', tethered)).toBe(1);
  });

  test('the ribbons still follow on a cyclic graph', () => {
    const circle: FlowPoint[] = [
      { source: 'A', target: 'B', value: 3 },
      { source: 'B', target: 'C', value: 2 },
      { source: 'C', target: 'A', value: 1 },
    ];

    expect(walk(flow(circle), 'FORWARD', 'FORWARD')).toEqual(['B', 'C']);
  });

  test('a cycle does not hang the jump to the end', () => {
    const circle: FlowPoint[] = [
      { source: 'A', target: 'B', value: 3 },
      { source: 'B', target: 'C', value: 2 },
      { source: 'C', target: 'A', value: 1 },
    ];
    const trace = flow(circle);

    expect(trace.moveToExtreme('FORWARD')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe('C');
  });
});

describe('the description answers what tracing one ribbon cannot', () => {
  test('totals what enters the system rather than summing every flow', () => {
    // Coal 56 and Gas 18. Adding all eight flows would count the same energy
    // again at every hop.
    expect(stat('Total flow')).toBe(74);
  });

  test('names the largest single flow', () => {
    expect(stat('Largest flow')).toBe('Coal to Electricity, 34');
  });

  test('names the route the eye takes', () => {
    // Start at the biggest source, take the widest branch at each step. It is
    // a fact about the succession of choices rather than about any node, so a
    // reader walking node by node cannot assemble it.
    expect(stat('Main route')).toBe('Coal to Electricity to Homes');
  });

  test('the data table is one row per flow', () => {
    const { headers, rows } = flow().description.dataTable;

    expect(headers).toEqual(['From', 'To', 'Petajoules']);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual(['Coal', 'Electricity', 34]);
  });
});

describe('the modalities read the flow by stage', () => {
  test('pitch is scaled within the stage, not across the chart', () => {
    // Flow is conserved, so the whole-chart range is dominated by the largest
    // source and every node past the first split would sit near its floor.
    const trace = flow();
    walk(trace, 'FORWARD');
    const { freq } = nonEmptyState(trace).audio;

    // Stage 1 is Electricity 46, Heat 20 and Losses 8.
    expect(freq).toEqual({ min: 8, max: 46, raw: 46 });
  });

  test('the sound pans downstream as the reader moves downstream', () => {
    const source = nonEmptyState(flow()).audio.panning;
    const trace = flow();
    walk(trace, 'FORWARD');

    expect(source.x).toBe(0);
    expect(nonEmptyState(trace).audio.panning.x).toBe(1);
  });

  test('braille gives one row per stage, not one per cursor row', () => {
    // The cursor is addressed as [indexWithinStage][stage] so the arrows sit
    // on the chart's geometry; a braille line has to be a stage, or the row
    // would be "the third node of every stage", which is not a thing.
    const braille = nonEmptyState(flow()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.values).toEqual([[56, 18], [8, 46, 20], [50, 16]]);
  });
});

describe('the flow walk can be entered in either direction', () => {
  test('pressing left first lands on the smallest flow, not on nothing', () => {
    // A fresh walk seeded at "before the first element" only reads correctly
    // rightwards: stepping back from it lands at -2, which is not a position.
    // Every other rotor test here presses right first, which is how the same
    // bug reached review on the choropleth.
    const trace = flow();

    expect(trace.moveToRotorFilter('outgoing', 'left')).toBe(true);
    // Coal's flows sorted largest first end at Losses, the 8.
    expect(nonEmptyState(trace).text.main.value).toBe('Losses');
  });

  test('entering leftwards then walking right returns the way it came', () => {
    const trace = flow();
    trace.moveToRotorFilter('outgoing', 'left');
    const last = String(nonEmptyState(trace).text.main.value);
    trace.moveToRotorFilter('outgoing', 'left');

    expect(trace.moveToRotorFilter('outgoing', 'right')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(last);
  });
});
