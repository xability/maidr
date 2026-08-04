import { describe, expect, it } from '@jest/globals';
import { defaultFormat, FormatUtil } from '@util/format';

describe('defaultFormat', () => {
  it('shortens a computed share to something a screen reader can speak', () => {
    // 120 of 210 under `barnorm: 'percent'` — the chart from #720, whose fix
    // made these shares announceable at all and left them at full precision.
    expect(defaultFormat(57.14285714285714)).toBe('57.14');
    expect(defaultFormat(42.857142857142854)).toBe('42.86');
  });

  it('drops the decimal point when rounding reaches a whole number', () => {
    // Nothing is padded, so a computed value can come out looking like one
    // that was read verbatim.
    expect(defaultFormat(99.999)).toBe('100');
    expect(defaultFormat(0.004)).toBe('0.004');
  });

  it('leaves an integer exactly as it was', () => {
    expect(defaultFormat(120)).toBe('120');
    expect(defaultFormat(0)).toBe('0');
    expect(defaultFormat(-40)).toBe('-40');
  });

  it('does not pad a value that is already short', () => {
    expect(defaultFormat(0.5)).toBe('0.5');
    expect(defaultFormat(2.25)).toBe('2.25');
    expect(defaultFormat(-1.5)).toBe('-1.5');
  });

  it('keeps a small value visible rather than rounding it away', () => {
    // Two decimals would announce each of these as `0`, which is not what the
    // chart shows.
    expect(defaultFormat(0.000123456)).toBe('0.000123');
    expect(defaultFormat(0.0004)).toBe('0.0004');
    expect(defaultFormat(-0.000987654)).toBe('-0.000988');
  });

  it('passes strings through untouched', () => {
    expect(defaultFormat('Q1')).toBe('Q1');
    expect(defaultFormat('57.14285714285714')).toBe('57.14285714285714');
  });

  it('does not attempt to round a non-finite number', () => {
    // Only NaN goes on to be rendered as `missing` by wrapFormat; Infinity is
    // announced as-is, which is pre-existing behaviour this does not change.
    expect(defaultFormat(Number.NaN)).toBe('NaN');
    expect(defaultFormat(Number.POSITIVE_INFINITY)).toBe('Infinity');
    expect(FormatUtil.wrapFormat(defaultFormat)(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('is still overridden by an explicit axis format', () => {
    const fixed = FormatUtil.resolveFormat({ type: 'fixed', decimals: 4 });
    const percent = FormatUtil.resolveFormat({ type: 'percent', decimals: 1 });

    expect(fixed(57.14285714285714)).toBe('57.1429');
    expect(percent(0.5714285714285714)).toBe('57.1%');
  });

  it('renders a missing value as missing once wrapped, not as a number', () => {
    const wrapped = FormatUtil.wrapFormat(defaultFormat);

    expect(wrapped(Number.NaN)).toBe('missing');
    expect(wrapped(57.14285714285714)).toBe('57.14');
  });
});
