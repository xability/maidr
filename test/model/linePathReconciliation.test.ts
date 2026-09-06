import type { LinePoint, MaidrLayer } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { LineTrace } from '@model/line';
import { TraceType } from '@type/grammar';

/**
 * Recovering the points a renderer simplified out of a line's path.
 *
 * Plotly's `line.simplify` and matplotlib's `path.simplify` both drop
 * collinear and sub-pixel vertices by default, so a dense line arrives with
 * fewer vertices than data points and every point's position has to be
 * interpolated back along the surviving segments. That runs in the
 * constructor, and again on every live-data append because the controller
 * rebuilds the figure — so on a long series it is time between the chart
 * appearing and the chart being usable.
 *
 * Searching the segments from the first one for every data point is
 * O(points x vertices). These pin that the search now carries on from where
 * the last one stopped, by counting how often the vertices are read, and
 * that the answer is unchanged — including on the paths where carrying on
 * would be wrong.
 */

/**
 * A vertex whose x can be read, and counted.
 *
 * The counter is what makes the shape of the search observable: a scan that
 * restarts at the first vertex reads them a number of times that grows with
 * the points as well as the vertices.
 */
interface CountingVertex extends LinePoint {
  x: number;
  y: number;
}

/**
 * Vertices that count how often their x is read.
 * @param xs - The x of each vertex, in path order
 * @param ys - The y of each vertex, in path order
 * @returns The vertices and the running count
 */
function countingVertices(
  xs: readonly number[],
  ys: readonly number[],
): { vertices: CountingVertex[]; reads: () => number } {
  let reads = 0;
  const vertices = xs.map((x, i) => ({
    get x(): number {
      reads++;
      return x;
    },
    y: ys[i],
  }));
  return { vertices, reads: () => reads };
}

/**
 * A line trace over one series of `points` points, x ascending from 0.
 *
 * No selectors, so nothing is resolved against a document and the trace is
 * pure data — which is all the reconciliation reads.
 * @param xs - The x of each data point, in the order the layer lists them
 * @returns The trace
 */
function series(xs: readonly number[]): LineTrace {
  const layer: MaidrLayer = {
    id: 'series',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [xs.map(x => ({ x, y: x }))],
  };
  return new LineTrace(layer);
}

/**
 * Reach the reconciliation, which is a documented extension point of
 * `LineTrace` — `StepTrace` overrides it — rather than an internal.
 */
class ProbeTrace extends LineTrace {
  /**
   * Reconcile a path's vertices with the first series' points.
   * @param coordinates - The vertices, mutated in place
   */
  public reconcile(coordinates: LinePoint[]): void {
    this.reconcilePathCoordinates(coordinates, 0);
  }
}

/**
 * A probe trace over one series of points with the given x values.
 * @param xs - The x of each data point, in the order the layer lists them
 * @returns The trace
 */
function probe(xs: readonly number[]): ProbeTrace {
  return new ProbeTrace({
    id: 'series',
    type: TraceType.LINE,
    axes: { x: { label: 'X' }, y: { label: 'Y' } },
    data: [xs.map(x => ({ x, y: x }))],
  });
}

/**
 * The reconciliation as it was written: for every data point, scan the
 * segments from the first one. Kept here as the oracle the faster search has
 * to agree with, on the paths where it takes its shortcut and on the paths
 * where it must not.
 * @param coordinates - The vertices parsed from the path
 * @param dataXs - The x of each data point
 * @returns One interpolated vertex per data point
 */
function byScanningFromTheStart(
  coordinates: readonly { x: number; y: number }[],
  dataXs: readonly number[],
): { x: number; y: number }[] {
  const pathXMin = coordinates[0].x;
  const pathXMax = coordinates[coordinates.length - 1].x;
  const dataXMin = dataXs[0];
  const dataXMax = dataXs[dataXs.length - 1];
  const dataXRange = dataXMax - dataXMin;

  return dataXs.map((dataX) => {
    const svgX = dataXRange > 0
      ? pathXMin + ((dataX - dataXMin) / dataXRange) * (pathXMax - pathXMin)
      : pathXMin;
    let svgY = coordinates[0].y;
    for (let j = 0; j < coordinates.length - 1; j++) {
      const cjx = coordinates[j].x;
      const cj1x = coordinates[j + 1].x;
      if (svgX >= cjx - 0.01 && svgX <= cj1x + 0.01) {
        const segLen = cj1x - cjx;
        const t = segLen > 0 ? (svgX - cjx) / segLen : 0;
        svgY = coordinates[j].y + t * (coordinates[j + 1].y - coordinates[j].y);
        break;
      }
    }
    return { x: svgX, y: svgY };
  });
}

/**
 * Reconcile `dataXs` points against `vertexXs` vertices and report both what
 * came out and what the oracle says should have.
 * @param vertexXs - The x of each surviving vertex
 * @param vertexYs - The y of each surviving vertex
 * @param dataXs - The x of each data point
 * @returns The reconciled vertices and the oracle's answer
 */
function reconcile(
  vertexXs: readonly number[],
  vertexYs: readonly number[],
  dataXs: readonly number[],
): { got: LinePoint[]; oracle: { x: number; y: number }[] } {
  const coordinates: LinePoint[] = vertexXs.map((x, i) => ({ x, y: vertexYs[i] }));
  probe(dataXs).reconcile(coordinates);
  return {
    got: coordinates,
    oracle: byScanningFromTheStart(
      vertexXs.map((x, i) => ({ x, y: vertexYs[i] })),
      dataXs,
    ),
  };
}

/**
 * How many times the vertices are read while reconciling `points` data points
 * against a path simplified to `points / 2` vertices.
 * @param points - How many data points the series carries
 * @returns The read count
 */
function vertexReads(points: number): number {
  const dataXs = Array.from({ length: points }, (_, i) => i);
  const vertexXs = Array.from({ length: points / 2 }, (_, j) => j * 2);
  const { vertices, reads } = countingVertices(vertexXs, vertexXs);
  probe(dataXs).reconcile(vertices);
  return reads();
}

describe('reconciling a simplified path with a series', () => {
  test('reads the vertices a number of times that grows with the vertices', () => {
    const small = vertexReads(200);
    const large = vertexReads(400);

    // Twice the work for twice the data. Restarting the scan at the first
    // vertex for every point makes it four times, because both the number of
    // points and the length of each scan double.
    expect(large).toBeLessThan(small * 3);
  });

  test('recovers the same points as a scan from the first vertex', () => {
    const { got, oracle } = reconcile([0, 10, 20, 30], [0, 5, 5, 20], [0, 1, 2, 3, 4, 5, 6]);

    expect(got).toEqual(oracle);
  });

  test('recovers the same points when consecutive vertices share an x', () => {
    // A degenerate segment: the first of the two is the one a scan settles
    // on, and the interpolation along it is flat.
    const { got, oracle } = reconcile([0, 10, 10, 30], [0, 5, 9, 20], [0, 1, 2, 3, 4]);

    expect(got).toEqual(oracle);
  });

  test('recovers the same points when the series doubles back', () => {
    // Out of order in x, so the segment for one point may lie before the
    // segment for the point ahead of it and the search cannot carry on.
    const { got, oracle } = reconcile([0, 10, 20, 30], [0, 5, 5, 20], [0, 5, 1, 4, 2]);

    expect(got).toEqual(oracle);
  });

  test('recovers the same points when the path is drawn right to left', () => {
    const { got, oracle } = reconcile([30, 20, 10, 0], [20, 5, 5, 0], [0, 1, 2, 3, 4]);

    expect(got).toEqual(oracle);
  });

  test('recovers the same points when every point shares one x', () => {
    const { got, oracle } = reconcile([0, 10, 20], [0, 5, 20], [2, 2, 2, 2]);

    expect(got).toEqual(oracle);
  });

  test('still pads with gaps when a single vertex cannot be interpolated', () => {
    const coordinates: LinePoint[] = [{ x: 0, y: 0 }];

    probe([0, 1, 2]).reconcile(coordinates);

    expect(coordinates).toHaveLength(3);
    expect(coordinates.slice(1).every(point => Number.isNaN(Number(point.x)))).toBe(true);
  });

  test('still drops the vertices a path has over its series', () => {
    const coordinates: LinePoint[] = [0, 1, 2, 3, 4].map(n => ({ x: n, y: n }));

    probe([0, 1, 2]).reconcile(coordinates);

    expect(coordinates).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  test('leaves a path with a vertex per point untouched', () => {
    const trace = series([0, 1, 2]);

    expect(trace.getAllHighlightElements()).toEqual([]);
  });
});
