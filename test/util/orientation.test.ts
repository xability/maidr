import { describe, expect, test } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { formatPlotType, resolveOrientation } from '@util/orientation';

describe('resolveOrientation', () => {
  const orientedTypes = [
    TraceType.BAR,
    TraceType.BOX,
    TraceType.CANDLESTICK,
    TraceType.DODGED,
    TraceType.HISTOGRAM,
    TraceType.NORMALIZED,
    TraceType.STACKED,
    TraceType.VIOLIN_BOX,
    TraceType.VIOLIN_KDE,
  ];

  test.each(orientedTypes)('defaults %s to vertical when undeclared', (type) => {
    expect(resolveOrientation(type)).toBe(Orientation.VERTICAL);
  });

  test.each(orientedTypes)('keeps the declared orientation of %s', (type) => {
    expect(resolveOrientation(type, Orientation.HORIZONTAL)).toBe(Orientation.HORIZONTAL);
    expect(resolveOrientation(type, Orientation.VERTICAL)).toBe(Orientation.VERTICAL);
  });

  const unorientedTypes = [
    TraceType.HEATMAP,
    TraceType.LINE,
    TraceType.SCATTER,
    TraceType.SMOOTH,
    TraceType.STEP,
  ];

  test.each(unorientedTypes)('reports no orientation for %s', (type) => {
    expect(resolveOrientation(type)).toBeUndefined();
  });

  test('reports no orientation for a type it does not know', () => {
    expect(resolveOrientation('not-a-trace-type')).toBeUndefined();
  });

  test('ignores an orientation declared on a type that has none', () => {
    expect(resolveOrientation(TraceType.LINE, Orientation.HORIZONTAL)).toBeUndefined();
  });
});

describe('formatPlotType', () => {
  test('prefixes the type with its orientation', () => {
    expect(formatPlotType('bar', Orientation.VERTICAL)).toBe('vertical bar');
    expect(formatPlotType('box', Orientation.HORIZONTAL)).toBe('horizontal box');
  });

  test('returns the bare type when there is no orientation', () => {
    expect(formatPlotType('heat')).toBe('heat');
    expect(formatPlotType('single line', undefined)).toBe('single line');
  });

  test('prefixes what resolveOrientation returns for an oriented type', () => {
    expect(formatPlotType('bar', resolveOrientation(TraceType.BAR))).toBe('vertical bar');
  });
});
