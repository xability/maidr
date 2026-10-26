import type { ContourPoint } from '@type/grammar';
import { describe, expect, test } from '@jest/globals';
import { contourCurveLevel, contourLevelCount } from '@util/contourLevel';

describe('contourCurveLevel', () => {
  test('reads the level from whichever point declares it', () => {
    const curve: ContourPoint[] = [{ x: 0, y: 0 }, { x: 1, y: 0, level: 3 }];

    expect(contourCurveLevel(curve)).toBe(3);
  });

  test('is NaN for a curve that declares no level', () => {
    expect(contourCurveLevel([{ x: 0, y: 0 }])).toBeNaN();
  });

  test('is NaN rather than a throw for a curve that is not a list of points', () => {
    // The entry instruction reads the payload before any trace has checked
    // it, while the chart is first rendered.
    const malformed = [null, 7, { x: 0 }] as unknown as ContourPoint[][];

    expect(malformed.map(curve => contourCurveLevel(curve))).toEqual([NaN, NaN, NaN]);
    expect(contourCurveLevel([null] as unknown as ContourPoint[])).toBeNaN();
  });
});

describe('contourLevelCount', () => {
  test('counts a level drawn as islands once', () => {
    const curves: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 5, y: 5, level: 1 }],
      [{ x: 0, y: 1, level: 2 }],
    ];

    expect(contourLevelCount(curves)).toBe(2);
  });

  test('counts each curve declaring no level as a level of its own', () => {
    const curves: ContourPoint[][] = [
      [{ x: 0, y: 0, level: 1 }],
      [{ x: 0, y: 1 }],
      [{ x: 0, y: 2 }],
    ];

    expect(contourLevelCount(curves)).toBe(3);
  });
});
