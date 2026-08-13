import type { DataAccessor } from '@adapters/d3/types';
import { inferAccessor, resolveAccessor, resolveAccessorOptional } from '@adapters/d3/util';
import { describe, expect, test } from '@jest/globals';

describe('resolveAccessor', () => {
  test('extracts a value via string accessor', () => {
    const datum = { x: 42, name: 'A' };
    expect(resolveAccessor<number>(datum, 'x', 0)).toBe(42);
    expect(resolveAccessor<string>(datum, 'name', 0)).toBe('A');
  });

  test('preserves falsy values (0, empty string, false) without throwing', () => {
    // Regression for the `!datum` falsy bug: 0 / '' / false are valid data
    // values, not "missing data".
    const datum = { x: 0, label: '', flag: false };
    expect(resolveAccessor<number>(datum, 'x', 0)).toBe(0);
    expect(resolveAccessor<string>(datum, 'label', 0)).toBe('');
    expect(resolveAccessor<boolean>(datum, 'flag', 0)).toBe(false);
  });

  test('invokes a function accessor with datum and index', () => {
    const datum = { a: 3, b: 4 };
    const accessor: DataAccessor<number> = (d, i) => {
      const r = d as { a: number; b: number };
      return r.a + r.b + i;
    };
    expect(resolveAccessor<number>(datum, accessor, 7)).toBe(14);
  });

  test('throws an actionable error when string accessor is missing', () => {
    const datum = { foo: 1, bar: 2 };
    expect(() => resolveAccessor<number>(datum, 'baz', 3)).toThrow(
      /Property "baz" not found on datum at index 3.*foo, bar/,
    );
  });
});

describe('resolveAccessorOptional', () => {
  test('returns the value when the property exists', () => {
    expect(resolveAccessorOptional<number>({ x: 5 }, 'x', 0)).toBe(5);
  });

  test('returns undefined for a missing property (does not throw)', () => {
    expect(resolveAccessorOptional<number>({ x: 5 }, 'missing', 0)).toBeUndefined();
  });

  test('preserves falsy values (0, empty string, false)', () => {
    expect(resolveAccessorOptional<number>({ x: 0 }, 'x', 0)).toBe(0);
    expect(resolveAccessorOptional<string>({ s: '' }, 's', 0)).toBe('');
    expect(resolveAccessorOptional<boolean>({ b: false }, 'b', 0)).toBe(false);
  });

  test('invokes function accessors directly', () => {
    expect(resolveAccessorOptional<number>({ a: 2 }, d => (d as { a: number }).a * 10, 0)).toBe(20);
  });
});

describe('inferAccessor', () => {
  test('returns user-provided string accessor verbatim', () => {
    const config = { x: 'customX' };
    expect(
      inferAccessor<number>(config, 'x', 'x', ['xVal', 'xValue'], { customX: 1 }),
    ).toBe('customX');
  });

  test('returns user-provided function accessor verbatim', () => {
    const fn = (d: unknown) => (d as { x: number }).x;
    const config = { x: fn };
    expect(
      inferAccessor<number>(config, 'x', 'x', [], { x: 7 }),
    ).toBe(fn);
  });

  test('falls back to defaultKey when present on the datum', () => {
    expect(
      inferAccessor<number>({}, 'x', 'x', ['xVal'], { x: 1 }),
    ).toBe('x');
  });

  test('walks alternatives in order when defaultKey is missing', () => {
    expect(
      inferAccessor<string>({}, 'x', 'x', ['label', 'name'], { name: 'A' }),
    ).toBe('name');
  });

  test('falls back to defaultKey when nothing matches (caller will see helpful error from resolveAccessor)', () => {
    expect(
      inferAccessor<number>({}, 'x', 'x', ['xVal'], { unrelated: 1 }),
    ).toBe('x');
  });

  test('handles non-object firstDatum (e.g. number primitives)', () => {
    expect(
      inferAccessor<number>({}, 'x', 'x', ['xVal'], 42),
    ).toBe('x');
    expect(
      inferAccessor<number>({}, 'x', 'x', ['xVal'], null),
    ).toBe('x');
  });
});
