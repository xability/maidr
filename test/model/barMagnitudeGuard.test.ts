/**
 * The core says so when a bar layer has its pair the wrong way round (#950).
 *
 * `toBarValue` answers `NaN` for anything unparseable, and `NaN` is a real
 * value here — it is how a *gap* travels, which is why `null`, `undefined` and
 * `''` reach it deliberately. `Number('apple')` is not a gap: it is a producer
 * that put the category name in the field the magnitude is read from, and
 * nothing downstream can tell the two apart. The chart loads, highlights,
 * navigates and announces, and every bar is silent.
 *
 * Three bindings shipped exactly that, each found by measuring the payload
 * rather than by anything the core said — r-maidr #184, py-maidr #480 and
 * py-maidr #482 — so what is asserted here is that the first bar of such a
 * layer now produces one actionable line, and that the gap cases still produce
 * none.
 */
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';

// The code under test warns on purpose, so the spy is installed once at file
// scope and cleared per test rather than re-installed: re-installing would let
// the expected warnings print on every run.
const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

beforeEach(() => {
  warn.mockClear();
});

/**
 * Builds a bar layer and returns whatever it warned.
 * @param orientation - What the layer declares
 * @param data - Its points, as a producer wrote them
 * @returns Every warning emitted while the trace was constructed
 */
function warningsFor(orientation: Orientation, data: object[]): string[] {
  TraceFactory.create({
    id: 'l0',
    type: TraceType.BAR,
    orientation,
    data,
  } as never);
  return warn.mock.calls.map(call => String(call[0]));
}

describe('a bar layer whose magnitude field holds a category name', () => {
  it('says so when a horizontal layer was written the vertical way', () => {
    // r-maidr #184 exactly: `"horz"` declared over `x = category`.
    const warnings = warningsFor(Orientation.HORIZONTAL, [
      { x: 'apple', y: 30 },
      { x: 'banana', y: 70 },
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"apple"');
  });

  it('says so when a vertical layer was written the horizontal way', () => {
    // py-maidr #480 exactly: the horizontal arrangement with no key, so the
    // layer resolves to vertical and reads `y`.
    const warnings = warningsFor(Orientation.VERTICAL, [
      { x: 30, y: 'apple' },
      { x: 70, y: 'banana' },
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"apple"');
  });

  it('names the field the magnitude was read from and the one it wants', () => {
    // The fix is always "swap them", so the message has to say which way round
    // the layer claimed to be -- a generic complaint would leave the producer
    // to guess, which is what the three bugs above each had to do.
    const [horizontal] = warningsFor(Orientation.HORIZONTAL, [
      { x: 'apple', y: 30 },
    ]);

    expect(horizontal).toContain('horz');
    expect(horizontal).toContain('`x`');
    expect(horizontal).toContain('`y`');
    expect(horizontal).toContain('MaidrLayer.orientation');
  });

  it('warns once for the layer rather than once per bar', () => {
    // Every point of such a layer is wrong, so one line is the signal and
    // twenty would bury it.
    const warnings = warningsFor(Orientation.HORIZONTAL, [
      { x: 'apple', y: 30 },
      { x: 'banana', y: 70 },
      { x: 'cherry', y: 50 },
    ]);

    expect(warnings).toHaveLength(1);
  });
});

describe('a bar layer that is written correctly', () => {
  it('says nothing about a vertical layer', () => {
    expect(warningsFor(Orientation.VERTICAL, [
      { x: 'apple', y: 30 },
      { x: 'banana', y: 70 },
    ])).toEqual([]);
  });

  it('says nothing about a horizontal layer', () => {
    expect(warningsFor(Orientation.HORIZONTAL, [
      { x: 30, y: 'apple' },
      { x: 70, y: 'banana' },
    ])).toEqual([]);
  });

  it('says nothing about a numeric category axis', () => {
    // A bar chart of years against counts is not mislabelled; `Number('2024')`
    // parses, so nothing here should fire.
    expect(warningsFor(Orientation.VERTICAL, [
      { x: '2023', y: 30 },
      { x: '2024', y: 70 },
    ])).toEqual([]);
  });
});

describe('the gap cases stay silent', () => {
  // These reach `toBarValue` on purpose and become `NaN` on purpose: the point
  // exists to navigate to and simply has no value, which the text layer
  // announces as missing. Warning about them would fire on every chart with a
  // hole in it -- the one regression this guard could plausibly cause.
  it.each([
    { name: 'a null magnitude', gap: null },
    { name: 'an undefined magnitude', gap: undefined },
    { name: 'an empty string', gap: '' },
    { name: 'a blank string', gap: '   ' },
  ])('says nothing about $name', ({ gap }) => {
    expect(warningsFor(Orientation.VERTICAL, [
      { x: 'apple', y: 30 },
      { x: 'banana', y: gap },
    ])).toEqual([]);
  });
});
