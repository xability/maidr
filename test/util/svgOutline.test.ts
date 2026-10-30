import type { ShapeOutline } from '@util/svg';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Svg } from '@util/svg';

/**
 * Where along a band or a ridge each of its points is marked. An outline
 * drawn through every point has a vertex at each one's x; one drawn with
 * fewer or more vertices than points has its points placed along it instead.
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

  it('places points with numeric x along the outline as a linear axis draws them', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // A curve drawn through more vertices than points.
    const xs = Svg.columnsAlong(outlineThrough([0, 10, 25, 50, 75, 100]), [1, 2, 5]);

    expect(xs).toEqual([0, 25, 100]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('spreads points whose x are not numbers evenly along the outline, and says it guessed', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const xs = Svg.columnsAlong(outlineThrough([0, 100]), ['Mon', 'Tue', 'Wed']);

    expect(xs).toEqual([0, 50, 100]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('spread evenly');
  });
});
