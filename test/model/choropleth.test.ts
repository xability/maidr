import type { ChoroplethPoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection } from '@type/movable';
import type { NonEmptyTraceState } from '@type/state';
import { describe, expect, test } from '@jest/globals';
import { ChoroplethTrace } from '@model/choropleth';
import { TraceFactory } from '@model/factory';
import { TraceType } from '@type/grammar';

/**
 * Six western states, with real centroids and real shared borders.
 *
 * The values are arranged so the high ones run along the south and touch,
 * which is the finding a map makes visible and a ranked list does not: not
 * that they are high, but that they are next to each other. Utah at 85 sits
 * just under the top-fifth cut and borders Nevada, so it is the region that
 * would join the run if the cut moved -- which is what makes it useful for
 * pinning where the cut actually falls.
 *
 * The latitudes are deliberately distinct. Nevada's and Utah's real centroids
 * both sit near 39.3, and a tie would make the banding depend on sort
 * stability rather than on the geography the test is about.
 */
const WEST: ChoroplethPoint[] = [
  { x: 'Washington', y: 10, lat: 47.4, lon: -120.5, neighbors: ['Oregon', 'Idaho'] },
  { x: 'Idaho', y: 30, lat: 44.4, lon: -114.6, neighbors: ['Washington', 'Oregon', 'Nevada', 'Utah'] },
  { x: 'Oregon', y: 20, lat: 43.9, lon: -120.6, neighbors: ['Washington', 'Idaho', 'Nevada', 'California'] },
  { x: 'Utah', y: 85, lat: 39.5, lon: -111.7, neighbors: ['Idaho', 'Nevada'] },
  { x: 'Nevada', y: 90, lat: 39.3, lon: -116.6, neighbors: ['Oregon', 'Idaho', 'Utah', 'California'] },
  { x: 'California', y: 95, lat: 37.2, lon: -119.4, neighbors: ['Oregon', 'Nevada'] },
];

/**
 * Create a minimal choropleth layer for model-only tests.
 * @param data The regions the layer carries
 * @returns Choropleth layer definition
 */
function createLayer(data: ChoroplethPoint[] = WEST): MaidrLayer {
  return {
    id: 'test-choropleth-layer',
    type: TraceType.CHOROPLETH,
    title: 'Something by state',
    axes: { x: { label: 'State' }, y: { label: 'Rate' } },
    data,
  };
}

/**
 * Read the trace's current state, asserting it is a populated one.
 * @param trace The trace to read
 * @returns The non-empty trace state
 */
function nonEmptyState(trace: ChoroplethTrace): NonEmptyTraceState {
  const state = trace.state;
  if (state.empty) {
    throw new Error('Expected a non-empty trace state');
  }
  return state;
}

/**
 * Build a choropleth trace sitting on its first region.
 * @param data The regions the layer carries
 * @returns The entered trace
 */
function choropleth(data: ChoroplethPoint[] = WEST): ChoroplethTrace {
  const trace = TraceFactory.create(createLayer(data)) as ChoroplethTrace;
  // The first move is the initial entry, which lands rather than moves.
  trace.moveOnce('FORWARD');
  return trace;
}

/**
 * Walk a sequence of moves and report where each one landed.
 * @param trace The trace to drive
 * @param directions The moves to make
 * @returns The region announced after each move, or null where it was refused
 */
function walk(trace: ChoroplethTrace, ...directions: MovableDirection[]): (string | null)[] {
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
 * @param data The regions the layer carries
 * @returns Its value, or undefined
 */
function stat(label: string, data: ChoroplethPoint[] = WEST): unknown {
  return choropleth(data).description.stats.find(entry => entry.label === label)?.value;
}

describe('choropleth registration', () => {
  test('the factory builds a ChoroplethTrace', () => {
    expect(TraceFactory.create(createLayer())).toBeInstanceOf(ChoroplethTrace);
  });

  test('it names itself a map rather than a bar chart', () => {
    expect(choropleth().description.chartType).toBe('Choropleth Map');
  });
});

describe('the arrows move across the map', () => {
  test('up goes north and down goes south', () => {
    // The direction that is easy to get backwards: MovableGrid moves UPWARD
    // by incrementing the row, so band zero has to be the southern one.
    // California is the southernmost state here and Oregon is north of it.
    const trace = choropleth();

    expect(nonEmptyState(trace).text.main.value).toBe('California');
    expect(walk(trace, 'UPWARD')).toEqual(['Oregon']);
    expect(walk(trace, 'DOWNWARD')).toEqual(['California']);
  });

  test('right goes east and left goes west', () => {
    expect(walk(choropleth(), 'FORWARD', 'FORWARD', 'BACKWARD'))
      .toEqual(['Nevada', 'Utah', 'Nevada']);
  });

  test('the walk is by latitude, not by the order the layer declared', () => {
    // Washington is declared first and is the northernmost state, so a trace
    // that kept the declared order would enter on it. Entering on California
    // is the whole of the difference between a map and a region list.
    const trace = choropleth();
    walk(trace, 'UPWARD');

    expect(walk(trace, 'FORWARD', 'FORWARD'))
      .toEqual(['Washington', 'Idaho']);
  });

  test('a layer with no centroids keeps its declared order in one band', () => {
    // The reading the data supports. Inventing positions would put regions
    // in directions from one another that the map does not.
    const unplaced: ChoroplethPoint[] = [
      { x: 'Alpha', y: 1 },
      { x: 'Beta', y: 2 },
    ];
    const trace = choropleth(unplaced);

    expect(nonEmptyState(trace).text.main.value).toBe('Alpha');
    expect(walk(trace, 'FORWARD', 'UPWARD')).toEqual(['Beta', null]);
  });
});

describe('borders are read from the declared adjacency', () => {
  test('a local maximum says so, which is what a hotspot is', () => {
    expect(nonEmptyState(choropleth()).text.asides)
      .toEqual([{ label: 'Neighbours', value: '2, all lower' }]);
  });

  test('a region below its surroundings says so too', () => {
    const trace = choropleth();
    walk(trace, 'UPWARD', 'FORWARD');

    expect(nonEmptyState(trace).text.asides)
      .toEqual([{ label: 'Neighbours', value: '2, all higher' }]);
  });

  test('a mixed neighbourhood counts the higher ones', () => {
    const trace = choropleth();
    walk(trace, 'UPWARD');

    // Oregon at 20: Washington 10 below it; Idaho 30, Nevada 90 and
    // California 95 above.
    expect(nonEmptyState(trace).text.asides)
      .toEqual([{ label: 'Neighbours', value: '4, 3 higher' }]);
  });

  test('a border to a region the map does not draw is not counted', () => {
    // A name in the list that no point declares is a region this map does
    // not draw, and counting it would report a border nobody can cross.
    const edged: ChoroplethPoint[] = [
      { x: 'Here', y: 5, lat: 1, lon: 1, neighbors: ['There', 'Elsewhere'] },
      { x: 'There', y: 9, lat: 2, lon: 1, neighbors: ['Here'] },
    ];
    const trace = choropleth(edged);

    expect(nonEmptyState(trace).text.asides)
      .toEqual([{ label: 'Neighbours', value: '1, all higher' }]);
  });

  test('a layer with no adjacency says nothing about borders', () => {
    const bare: ChoroplethPoint[] = [
      { x: 'Alpha', y: 1, lat: 1, lon: 1 },
      { x: 'Beta', y: 2, lat: 2, lon: 1 },
    ];

    expect(nonEmptyState(choropleth(bare)).text.asides).toBeUndefined();
  });
});

describe('the description answers what a ranked list cannot', () => {
  test('names the extremes', () => {
    expect(stat('Highest')).toBe('California, 95');
    expect(stat('Lowest')).toBe('Washington, 10');
  });

  test('finds the borders the value jumps hardest across', () => {
    // The edges an eye finds instantly and a value-ordered walk never
    // reports, because the two sides are far apart in that ordering.
    // California 95 against Oregon 20 is the widest at 75, and the high side
    // is named first so the pair reads as the drop it is.
    expect(String(stat('Sharpest borders'))).toMatch(/^California to Oregon, 75/);
  });

  test('counts a border once rather than from both sides', () => {
    const listed = String(stat('Sharpest borders')).split('; ');

    expect(listed).toHaveLength(3);
    expect(listed).not.toContain('Oregon to California, 75');
  });

  test('finds the cluster of high regions, which is the map finding', () => {
    // Not that the regions are high, but that they touch. A ranked list
    // gives the first fact and can never give the second.
    //
    // Two, not three: the cut is the top fifth by value, which on a six
    // region map is California 95 and Nevada 90. Utah at 85 borders Nevada
    // and would extend the run, and is excluded because it is not high --
    // which is the cut doing its job rather than the connectivity failing.
    expect(stat('Largest cluster of high regions'))
      .toBe('2 regions, California, Nevada');
  });

  test('high regions that do not touch are not called a cluster', () => {
    // The test the connected fixture cannot make on its own: with both high
    // regions adjacent there, an implementation that ignored adjacency and
    // simply collected the high ones gives the same answer.
    //
    // Six regions, because the cut is a quantile: on a three region map it
    // admits only one, and the cluster would then be refused for being a
    // single region rather than for being disconnected -- which would be the
    // same fixture failing to test the same thing one step earlier.
    //
    // A and F are the two highest and sit at opposite ends of a chain, so
    // they are high together and touching nothing.
    const apart: ChoroplethPoint[] = [
      { x: 'A', y: 100, lat: 1, lon: 1, neighbors: ['B'] },
      { x: 'B', y: 1, lat: 2, lon: 1, neighbors: ['A', 'C'] },
      { x: 'C', y: 2, lat: 3, lon: 1, neighbors: ['B', 'D'] },
      { x: 'D', y: 3, lat: 4, lon: 1, neighbors: ['C', 'E'] },
      { x: 'E', y: 4, lat: 5, lon: 1, neighbors: ['D', 'F'] },
      { x: 'F', y: 99, lat: 6, lon: 1, neighbors: ['E'] },
    ];

    // Both clear the cut -- so this is adjacency refusing them, not the cut.
    expect(stat('Highest', apart)).toBe('A, 100');
    expect(stat('Largest cluster of high regions', apart)).toBeUndefined();
  });

  test('a high region standing alone is not called a cluster', () => {
    // It is already the Highest stat, and calling one region a cluster
    // asserts something about the geography that is not there.
    const scattered: ChoroplethPoint[] = [
      { x: 'Alpha', y: 100, lat: 1, lon: 1, neighbors: ['Beta'] },
      { x: 'Beta', y: 1, lat: 2, lon: 1, neighbors: ['Alpha', 'Gamma'] },
      { x: 'Gamma', y: 2, lat: 3, lon: 1, neighbors: ['Beta'] },
    ];

    expect(stat('Largest cluster of high regions', scattered)).toBeUndefined();
  });
});

describe('the modalities read the whole map on one scale', () => {
  test('pitch is scaled across every region, as the colour ramp is', () => {
    const { freq } = nonEmptyState(choropleth()).audio;

    expect(freq).toEqual({ min: 10, max: 95, raw: 95 });
  });

  test('braille gives one row per band', () => {
    const braille = nonEmptyState(choropleth()).braille;
    if (braille.empty) {
      throw new Error('Expected a populated braille state');
    }

    expect(braille.values).toEqual([[95, 90, 85], [20, 10, 30]]);
  });
});

describe('the neighbour rotor pages through every border', () => {
  test('it visits all four of a hub region, rather than bouncing', () => {
    // Nevada borders Oregon, Idaho, Utah and California. A reader pressing
    // right repeatedly should page through the borders it has, which is the
    // whole of what the mode is for.
    const trace = choropleth();
    walk(trace, 'FORWARD');

    expect(nonEmptyState(trace).text.main.value).toBe('Nevada');

    const visited: string[] = [];
    while (trace.moveToRotorFilter('neighbours', 'right')) {
      visited.push(String(nonEmptyState(trace).text.main.value));
      if (visited.length > 8) {
        break;
      }
    }

    expect(visited.sort()).toEqual(['California', 'Idaho', 'Oregon', 'Utah']);
  });

  test('it walks back the way it came', () => {
    const trace = choropleth();
    walk(trace, 'FORWARD');
    trace.moveToRotorFilter('neighbours', 'right');
    const first = String(nonEmptyState(trace).text.main.value);
    trace.moveToRotorFilter('neighbours', 'right');

    expect(trace.moveToRotorFilter('neighbours', 'left')).toBe(true);
    expect(nonEmptyState(trace).text.main.value).toBe(first);
  });

  test('walking away with the arrows re-anchors on where you now are', () => {
    // The mode walks the borders of the region the reader entered it from.
    // Leaving with the arrows and coming back has to pick up the new
    // region's borders, not carry the old region's list along.
    const trace = choropleth();
    walk(trace, 'FORWARD');
    trace.moveToRotorFilter('neighbours', 'right');
    walk(trace, 'UPWARD');

    expect(nonEmptyState(trace).text.main.value).toBe('Oregon');

    trace.moveToRotorFilter('neighbours', 'right');

    // Oregon's borders, not California's.
    expect(['Washington', 'Idaho', 'Nevada', 'California'])
      .toContain(String(nonEmptyState(trace).text.main.value));
  });
});

describe('what a half-declared map is told', () => {
  test('a centroid on only some regions falls back for all of them', () => {
    // The same code path as declaring none, but a different authoring
    // mistake: a partial layout would put the placed regions in real
    // directions and the rest wherever they landed, which reads as a map and
    // is not one.
    const partial: ChoroplethPoint[] = [
      { x: 'Placed', y: 1, lat: 10, lon: 1 },
      { x: 'Unplaced', y: 2 },
    ];
    const trace = choropleth(partial);

    expect(nonEmptyState(trace).text.main.value).toBe('Placed');
    // One band, declared order: north of `Placed` there is nothing, because
    // the map was never laid out.
    expect(walk(trace, 'UPWARD')).toEqual([null]);
    expect(walk(trace, 'FORWARD')).toEqual(['Unplaced']);
  });

  test('a duplicate region name leaves the first one addressable', () => {
    // A name that is not unique cannot be an adjacency key. Keeping the
    // first means one of the two is still correct, rather than every border
    // of the earlier region silently pointing at the later one.
    const clashing: ChoroplethPoint[] = [
      { x: 5, y: 10, lat: 1, lon: 1, neighbors: ['Other'] },
      { x: '5', y: 20, lat: 2, lon: 1 },
      { x: 'Other', y: 30, lat: 3, lon: 1, neighbors: [5] },
    ];
    const trace = choropleth(clashing);

    expect(nonEmptyState(trace).text.asides)
      .toEqual([{ label: 'Neighbours', value: '1, all higher' }]);
  });
});
