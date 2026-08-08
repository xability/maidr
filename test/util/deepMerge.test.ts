import { describe, expect, test } from '@jest/globals';
import { deepMerge } from '@util/deepMerge';

describe('deepMerge', () => {
  test('fills missing keys from defaults', () => {
    const defaults = { a: 1, b: 2, c: 3 };
    const override = { b: 20 };
    const result = deepMerge(defaults, override);
    expect(result).toEqual({ a: 1, b: 20, c: 3 });
  });

  test('recurses into nested objects', () => {
    const defaults = { outer: { a: 1, b: 2 }, flag: false };
    const override = { outer: { b: 20 } as { a: number; b: number } };
    const result = deepMerge(defaults, override);
    expect(result).toEqual({ outer: { a: 1, b: 20 }, flag: false });
  });

  test('null primitive override value falls back to default', () => {
    const defaults = { a: 1, b: 'hello' };
    const override = { a: null as unknown as number, b: null as unknown as string };
    const result = deepMerge(defaults, override);
    expect(result).toEqual({ a: 1, b: 'hello' });
  });

  test('null nested override value falls back to default', () => {
    const defaults = { nested: { x: 1, y: 2 } };
    const override = { nested: null as unknown as { x: number; y: number } };
    const result = deepMerge(defaults, override);
    expect(result).toEqual({ nested: { x: 1, y: 2 } });
  });

  test('undefined override value falls back to default', () => {
    const defaults = { a: 1, b: 2 };
    const override = { a: undefined };
    const result = deepMerge(defaults, override);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  test('does not mutate the defaults object', () => {
    const defaults = { outer: { a: 1 } };
    const override = { outer: { a: 2 } };
    deepMerge(defaults, override);
    expect(defaults).toEqual({ outer: { a: 1 } });
  });

  test('array-typed override replaces the default array (not merged element-wise)', () => {
    // Pins the documented behavior: arrays are not recursed into. A saved
    // older value will overwrite the default array rather than merging.
    const defaults = { tags: ['a', 'b', 'c'], count: 3 };
    const override = { tags: ['x'] };
    const result = deepMerge(defaults, override);
    expect(result).toEqual({ tags: ['x'], count: 3 });
  });

  test('array-typed override with shorter array does not retain default tail', () => {
    // Belt-and-suspenders: confirm no element-wise merge leaks through.
    const defaults = { items: [1, 2, 3, 4, 5] };
    const override = { items: [9] };
    const result = deepMerge(defaults, override);
    expect(result.items).toEqual([9]);
    expect(result.items.length).toBe(1);
  });
});
