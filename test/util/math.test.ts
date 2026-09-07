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

describe('MathUtil.pearson', () => {
  it('reports a perfect positive relationship as 1', () => {
    expect(MathUtil.pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBe(1);
  });

  it('reports a perfect negative relationship as -1', () => {
    expect(MathUtil.pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBe(-1);
  });

  it('clamps float error back inside the range a caller can band', () => {
    // A perfect line routinely divides out to 1.0000000000000002, which would
    // fall outside every strength band and print with sixteen digits.
    const r = MathUtil.pearson([1, 2, 3, 4, 5, 6, 7], [3, 6, 9, 12, 15, 18, 21]);

    expect(r).not.toBeNull();
    expect(Math.abs(r as number)).toBeLessThanOrEqual(1);
  });

  it('agrees with the textbook value on a scattered sample', () => {
    // r = 0.8285714286 for these six pairs.
    const r = MathUtil.pearson([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5]);

    expect(r).toBeCloseTo(0.8285714286, 8);
  });

  it('survives values that are large beside their spread', () => {
    // Genomic positions on a Manhattan plot's x. The one-pass form cancels
    // catastrophically here and can return an r outside [-1, 1] or NaN.
    const base = 1e9;
    const xs = [base + 1, base + 2, base + 3, base + 4, base + 5];
    const ys = [1, 2, 3, 4, 5];

    expect(MathUtil.pearson(xs, ys)).toBeCloseTo(1, 6);
  });

  it('makes no claim from fewer than three pairs', () => {
    // Any two distinct points lie exactly on a line, so r would be 1 by
    // construction and say nothing about the data.
    expect(MathUtil.pearson([1, 2], [5, 9])).toBeNull();
    expect(MathUtil.pearson([1], [5])).toBeNull();
    expect(MathUtil.pearson([], [])).toBeNull();
  });

  it('makes no claim when an axis never moves', () => {
    expect(MathUtil.pearson([1, 2, 3, 4], [7, 7, 7, 7])).toBeNull();
    expect(MathUtil.pearson([3, 3, 3, 3], [1, 2, 3, 4])).toBeNull();
  });

  it('skips a pair with a non-finite coordinate rather than reading it as zero', () => {
    const withGap = MathUtil.pearson(
      [1, 2, Number.NaN, 3, 4],
      [2, 4, 10, 6, 8],
    );

    expect(withGap).toBe(1);
  });

  it('falls back to no claim when the gaps leave too few pairs', () => {
    expect(MathUtil.pearson([1, Number.NaN, Number.NaN], [1, 2, 3])).toBeNull();
  });

  it('counts only the pairs it could use', () => {
    expect(MathUtil.pairedCount([1, 2, Number.NaN, 4], [1, 2, 3, Number.NaN])).toBe(2);
  });
});

describe('MathUtil.spannedOrMissing', () => {
  it('spans a real extent', () => {
    expect(MathUtil.spannedOrMissing(1, 9)).toBe('1 to 9');
  });

  it('keeps a genuinely constant axis, which is finite and true', () => {
    expect(MathUtil.spannedOrMissing(0, 0)).toBe('constant 0');
  });

  it('says missing rather than printing the empty-set sentinels', () => {
    // safeMin/safeMax answer these for an empty array by design, and
    // `Infinity to -Infinity` is a string the dialog's non-finite blanking
    // cannot catch.
    expect(MathUtil.spannedOrMissing(Infinity, -Infinity)).toBe('missing');
    expect(MathUtil.spannedOrMissing(Number.NaN, Number.NaN)).toBe('missing');
  });
});

describe('MathUtil.spanned', () => {
  it('rounds a computed float to what a screen reader can speak', () => {
    expect(MathUtil.spanned(21.957700280519678, 99.3836370729716)).toBe('21.96 to 99.38');
  });
});
