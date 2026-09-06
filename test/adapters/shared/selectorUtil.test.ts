import { cssEscape } from '@adapters/shared/selectorUtil';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

/**
 * `cssEscape` falls back to a hand-rolled escape wherever `CSS.escape` is
 * missing — Node, SSR, and jsdom, which implements no `CSS` object at all.
 * The fallback therefore has to reproduce the native result, because a
 * selector that the fallback leaves invalid throws a `SyntaxError` out of
 * `document.querySelectorAll` rather than merely failing to match, and every
 * adapter builds its scoped selectors by embedding an author-supplied
 * container id.
 */
describe('cssEscape in an environment without CSS.escape', () => {
  /** Parses the selector, returning whether the CSS parser accepted it. */
  function parses(selector: string): boolean {
    const dom = new JSDOM('<!doctype html><body></body>');
    try {
      dom.window.document.querySelectorAll(selector);
      return true;
    } catch {
      return false;
    }
  }

  it('escapes a leading digit the way CSS.escape does', () => {
    const escaped = cssEscape('2024-sales');

    expect(escaped).toBe('\\32 024-sales');
  });

  it('escapes a leading digit behind a hyphen', () => {
    const escaped = cssEscape('-2024-sales');

    expect(escaped).toBe('-\\32 024-sales');
  });

  it('yields an id selector the CSS parser accepts for a digit-led id', () => {
    const selector = `#${cssEscape('2024-sales')} .bar`;

    expect(parses(selector)).toBe(true);
  });

  it('escapes a dot so the id is not read as an id plus a class', () => {
    const escaped = cssEscape('my.chart');

    expect(escaped).toBe('my\\.chart');
  });

  it('leaves an id that is already a valid identifier alone', () => {
    const escaped = cssEscape('chart-1_a');

    expect(escaped).toBe('chart-1_a');
  });
});
