/**
 * @jest-environment jsdom
 */

/**
 * Tests for the selector guards in `src/util/svg.ts`.
 *
 * Selectors arrive from parsed JSON and are cast to `string` at the call site,
 * so a producer that resolves nothing for a layer can send `[]` — truthy, and
 * therefore past every `if (!selector)` guard in the model layer. Before the
 * guard, `document.querySelectorAll([])` coerced it to `''` and threw a
 * `SyntaxError` that escaped figure construction, leaving the entire figure
 * inert: no announcements, no navigation, including for the subplots whose own
 * selectors were valid.
 *
 * The contract these tests pin: an unusable query matches nothing, and never
 * throws.
 */

import { beforeEach, describe, expect, it } from '@jest/globals';
import { Svg } from '@util/svg';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Values that reach `Svg` typed as `string` but are not usable selectors.
 * `[]` is the case reported from r-maidr's patchwork output; the rest share
 * the same shape — truthy or otherwise unusable, and fatal to `querySelector`.
 */
const UNUSABLE: { label: string; value: string }[] = [
  { label: 'an empty array', value: [] as unknown as string },
  { label: 'an empty string', value: '' },
  { label: 'a whitespace-only string', value: '   ' },
  { label: 'undefined', value: undefined as unknown as string },
  { label: 'null', value: null as unknown as string },
  { label: 'a number', value: 42 as unknown as string },
  { label: 'an object', value: {} as unknown as string },
];

describe('svg selector guards', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    group.setAttribute('id', 'bars');
    for (let i = 0; i < 3; i++) {
      group.appendChild(document.createElementNS(SVG_NAMESPACE, 'rect'));
    }
    svg.appendChild(group);
    document.body.appendChild(svg);
  });

  describe('selectAllElements', () => {
    it.each(UNUSABLE)('returns an empty array for $label', ({ value }) => {
      expect(() => Svg.selectAllElements(value)).not.toThrow();
      expect(Svg.selectAllElements(value)).toEqual([]);
    });

    it('inserts no clones into the DOM for an unusable query', () => {
      const before = document.querySelectorAll('#bars > rect').length;
      Svg.selectAllElements([] as unknown as string);
      expect(document.querySelectorAll('#bars > rect')).toHaveLength(before);
    });

    it('still resolves a valid selector', () => {
      // Guarding the unusable cases must not change the working path: three
      // rects in, three hidden clones out.
      expect(Svg.selectAllElements('#bars > rect')).toHaveLength(3);
      expect(document.querySelectorAll('#bars > rect')).toHaveLength(6);
    });
  });

  describe('selectElement', () => {
    it.each(UNUSABLE)('returns null for $label', ({ value }) => {
      expect(() => Svg.selectElement(value)).not.toThrow();
      expect(Svg.selectElement(value)).toBeNull();
    });

    it('returns null when a well-formed selector matches nothing', () => {
      // `null`, not `undefined`: the declared return type is `T | null`, and
      // the clone path used to fall through to an undefined clone.
      expect(Svg.selectElement('#absent > rect')).toBeNull();
      expect(Svg.selectElement('#absent > rect', false)).toBeNull();
    });

    it('still resolves a valid selector', () => {
      expect(Svg.selectElement('#bars > rect', false)).not.toBeNull();
    });

    it('marks the clone it inserts as MAIDR-owned', () => {
      const clone = Svg.selectElement('#bars > rect');
      expect(clone).not.toBeNull();
      expect(Svg.isOwned(clone as SVGElement)).toBe(true);
    });
  });

  describe('selectNthElement', () => {
    it.each(UNUSABLE)('returns null for $label', ({ value }) => {
      expect(() => Svg.selectNthElement(value, 0)).not.toThrow();
      expect(Svg.selectNthElement(value, 0)).toBeNull();
    });

    it('still resolves a valid selector', () => {
      expect(Svg.selectNthElement('#bars > rect', 1)).not.toBeNull();
      expect(Svg.selectNthElement('#bars > rect', 9)).toBeNull();
    });
  });
});
