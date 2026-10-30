import type { ShapeOutline } from '@util/svg';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Svg } from '@util/svg';

/**
 * Where along a band or a ridge each of its points is marked. An outline
 * drawn through every point has a vertex at each one's x. One drawn with
 * fewer has its points placed along it when the vertices it kept agree; any
 * other has none placed, and is outlined whole.
 *
 * Each case that warns draws an outline of its own shape: the warning is
 * given once per shape, for as long as the module is loaded.
 */

/**
 * An open outline through the given x, at height 0.
 * @param xs - Its vertices' x
 * @returns The outline
 */
function outlineThrough(xs: number[]): ShapeOutline {
  return { vertices: xs.map(x => ({ x, y: 0 })), closed: false };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Svg.columnsAlong', () => {
  it('places each point at its own vertex when the outline has one per point', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(Svg.columnsAlong(outlineThrough([0, 40, 100]), ['a', 'b', 'c'])).toEqual([0, 40, 100]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('places points by their x along an outline that dropped the vertices of straight runs', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Plotly keeps only the vertices where the line turns.
    const xs = Svg.columnsAlong(outlineThrough([0, 20, 60, 100]), [0, 10, 20, 40, 60, 80, 100]);

    expect(xs).toEqual([0, 10, 20, 40, 60, 80, 100]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('places points evenly along an outline that dropped vertices, as a category axis spaces them', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const xs = Svg.columnsAlong(outlineThrough([0, 50, 100]), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

    expect(xs).toEqual([0, 25, 50, 75, 100]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('places no point, and says so, where the vertices kept stand at neither placing, as on a log axis', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // 1, 2, 5, 10 and 100 on a log axis 100 wide are drawn at 0, 15.05,
    // 34.95, 50 and 100. Without the vertex at 2, a linear spread would put
    // 2 at 1.01 and 5 at 4.04.
    const xs = Svg.columnsAlong(outlineThrough([0, 34.95, 50, 100]), [1, 2, 5, 10, 100]);

    expect(xs).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('outlined whole');
  });

  it('places no point along an outline that kept no vertex between its ends', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const xs = Svg.columnsAlong(outlineThrough([0, 100]), [1, 2, 3]);

    expect(xs).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('places no point along a curve drawn with more vertices than points', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const xs = Svg.columnsAlong(outlineThrough([0, 10, 25, 50, 75, 100]), [1, 2, 5]);

    expect(xs).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('says so once for each shape of outline', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    Svg.columnsAlong(outlineThrough([0, 100]), ['a', 'b', 'c', 'd']);
    Svg.columnsAlong(outlineThrough([10, 90]), ['e', 'f', 'g', 'h']);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
