import { describe, expect, test } from '@jest/globals';
import { Orientation, TraceType } from '@type/grammar';
import { formatPlotType, resolveOrientation } from '@util/orientation';

describe('resolveOrientation', () => {
  const orientedTypes = [
    TraceType.BAR,
    TraceType.BOX,
    TraceType.CANDLESTICK,
    TraceType.DODGED,
    // The interval runs along the value axis and the samples along the other,
    // so which way round they are drawn decides which axis a bound moves on.
    TraceType.ERROR_BAR,
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
    // An area trace is navigated along its series and then between series,
    // exactly as a line is, whichever way the band is drawn.
    TraceType.AREA,
    TraceType.CANDLESTICK_DELTA,
    // One measure on a dial: no second axis to swap with.
    TraceType.GAUGE,
    TraceType.HEATMAP,
    TraceType.LINE,
    TraceType.NORMALIZED_AREA,
    TraceType.PIE,
    TraceType.SCATTER,
    TraceType.SMOOTH,
    TraceType.STACKED_AREA,
    TraceType.STEP,
    // A waterfall is navigated one column per step whichever way the bars
    // are drawn, so there is no main and cross axis to swap.
    TraceType.WATERFALL,
    // Terms are packed, not laid along an axis, and are walked by weight.
    TraceType.WORD_CLOUD,
  ];

  test('answers for every trace type', () => {
    const covered = [...orientedTypes, ...unorientedTypes];
    expect(covered.sort()).toEqual(Object.values(TraceType).sort());
  });

  test.each(unorientedTypes)('reports no orientation for %s', (type) => {
    expect(resolveOrientation(type)).toBeUndefined();
  });

  test('reports no orientation for a type it does not know', () => {
    expect(resolveOrientation('not-a-trace-type')).toBeUndefined();
  });

  test('ignores an orientation declared on a type that has none', () => {
    expect(resolveOrientation(TraceType.LINE, Orientation.HORIZONTAL)).toBeUndefined();
    // Slices sit around a circle, so a producer that emits an orientation for
    // a pie anyway must not get "vertical pie" announced.
    expect(resolveOrientation(TraceType.PIE, Orientation.VERTICAL)).toBeUndefined();
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
