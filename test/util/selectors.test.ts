import { describe, expect, it } from '@jest/globals';
import { declaresSelectors, joinSelectorList } from '@util/selectors';

/**
 * `joinSelectorList` restores exactly one pre-4.0 meaning -- a flat list of
 * strings is the selector list the DOM made of it -- and nothing wider, so the
 * protection #750 added against `[]` and `''` stands.
 */
describe('joinSelectorList', () => {
  it('joins a flat list of strings into one selector list', () => {
    expect(joinSelectorList(['#a rect'])).toBe('#a rect');
    expect(joinSelectorList(['#a rect', '#b rect'])).toBe('#a rect, #b rect');
  });

  it('is not a legacy list when empty, blank, nested or not strings', () => {
    expect(joinSelectorList([])).toBeNull();
    expect(joinSelectorList([''])).toBeNull();
    expect(joinSelectorList(['#a', '  '])).toBeNull();
    expect(joinSelectorList([['#a']])).toBeNull();
    expect(joinSelectorList(['#a', null])).toBeNull();
    expect(joinSelectorList([{ min: '#a' }])).toBeNull();
  });

  it('leaves anything that is not a list alone', () => {
    expect(joinSelectorList('#a rect')).toBeNull();
    expect(joinSelectorList(undefined)).toBeNull();
    expect(joinSelectorList({ body: '#a' })).toBeNull();
  });
});

describe('declaresSelectors', () => {
  it('treats undefined, blank and empty as naming nothing', () => {
    expect(declaresSelectors(undefined)).toBe(false);
    expect(declaresSelectors(null)).toBe(false);
    expect(declaresSelectors('')).toBe(false);
    expect(declaresSelectors('   ')).toBe(false);
    expect(declaresSelectors([])).toBe(false);
  });

  it('treats a selector, a list, a grid or an object as a declaration', () => {
    expect(declaresSelectors('#a')).toBe(true);
    expect(declaresSelectors(['#a'])).toBe(true);
    expect(declaresSelectors([['#a', null]])).toBe(true);
    expect(declaresSelectors([{ min: '#a' }])).toBe(true);
    expect(declaresSelectors({ body: '#a' })).toBe(true);
  });
});
