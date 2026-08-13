import { describe, expect, it } from '@jest/globals';
import { MathUtil } from '@util/math';

describe('MathUtil.clamp', () => {
  it('returns the value when inside the range', () => {
    expect(MathUtil.clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('returns min when value is below the range', () => {
    expect(MathUtil.clamp(-2, -1, 1)).toBe(-1);
  });

  it('returns max when value is above the range', () => {
    expect(MathUtil.clamp(5, 0, 1)).toBe(1);
  });

  it('honours inclusive bounds', () => {
    expect(MathUtil.clamp(0, 0, 1)).toBe(0);
    expect(MathUtil.clamp(1, 0, 1)).toBe(1);
  });
});

describe('MathUtil.interpolate', () => {
  it('maps the source minimum to the target minimum', () => {
    expect(MathUtil.interpolate(0, 0, 10, 100, 200)).toBe(100);
  });

  it('maps the source maximum to the target maximum', () => {
    expect(MathUtil.interpolate(10, 0, 10, 100, 200)).toBe(200);
  });

  it('linearly interpolates intermediate values', () => {
    expect(MathUtil.interpolate(5, 0, 10, 100, 200)).toBe(150);
  });

  it('extrapolates beyond the source range', () => {
    expect(MathUtil.interpolate(15, 0, 10, 100, 200)).toBe(250);
    expect(MathUtil.interpolate(-5, 0, 10, 100, 200)).toBe(50);
  });

  // Zero-width source range would divide by zero; collapsing to toMin keeps
  // the result a finite number rather than NaN.
  it('collapses to toMin when the source range is zero-width', () => {
    expect(MathUtil.interpolate(42, 7, 7, 100, 200)).toBe(100);
  });

  it('supports an inverted target range', () => {
    expect(MathUtil.interpolate(2, 0, 10, 200, 100)).toBe(180);
  });
});
