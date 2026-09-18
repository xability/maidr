import {
  clockDegrees,
  clockFromClockwiseOf3,
  clockFromCounterclockwiseOf3,
  isAngle,
  pieGeometry,
} from '@adapters/shared/pieGeometry';
import { describe, expect, it } from '@jest/globals';
import { PieDirection } from '@type/grammar';

describe('pie geometry conversions', () => {
  it('normalizes an angle onto the dial', () => {
    expect(clockDegrees(0)).toBe(0);
    expect(clockDegrees(450)).toBe(90);
    expect(clockDegrees(-90)).toBe(270);
    expect(clockDegrees(360)).toBe(0);
  });

  it('turns the mathematical convention into the clock', () => {
    // matplotlib, ECharts and Recharts: 0 is 3 o'clock, 90 is the top.
    expect(clockFromCounterclockwiseOf3(0)).toBe(90);
    expect(clockFromCounterclockwiseOf3(90)).toBe(0);
    expect(clockFromCounterclockwiseOf3(180)).toBe(270);
    expect(clockFromCounterclockwiseOf3(-90)).toBe(180);
  });

  it('turns the clockwise-from-3 convention into the clock', () => {
    // amCharts: -90 is the top, 0 is 3 o'clock.
    expect(clockFromClockwiseOf3(-90)).toBe(0);
    expect(clockFromClockwiseOf3(0)).toBe(90);
    expect(clockFromClockwiseOf3(270)).toBe(0);
  });

  it('recognizes a usable angle', () => {
    expect(isAngle(45)).toBe(true);
    expect(isAngle(0)).toBe(true);
    expect(isAngle(Number.NaN)).toBe(false);
    expect(isAngle('45')).toBe(false);
    expect(isAngle(undefined)).toBe(false);
  });
});

describe('pie geometry keys', () => {
  it('declares nothing for a clockwise ring from the top', () => {
    // The grammar's defaults, and what every layer declared before the keys
    // existed.
    expect(pieGeometry(0, true)).toEqual({});
    expect(pieGeometry(360, true)).toEqual({});
  });

  it('declares only what differs from the defaults', () => {
    expect(pieGeometry(90, true)).toEqual({ startAngle: 90 });
    expect(pieGeometry(0, false)).toEqual({ direction: PieDirection.COUNTERCLOCKWISE });
    expect(pieGeometry(-90, false)).toEqual({
      startAngle: 270,
      direction: PieDirection.COUNTERCLOCKWISE,
    });
  });
});
