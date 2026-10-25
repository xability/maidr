import type { WordKey } from '@adapters/mermaid/words';
import { sayIn, sayKnown, WORDS } from '@adapters/mermaid/words';
import { en } from '@adapters/mermaid/words/en';
import { describe, expect, it } from '@jest/globals';
import { SUPPORTED_LOCALES } from '@util/i18n';

/**
 * The words the Mermaid adapter writes into the chart data, in every language
 * MAIDR speaks: the same checks as MAIDR's own dictionaries, and the one more
 * the adapter's attribute names need.
 */

const english = en as Record<WordKey, string>;
const KEYS = Object.keys(english) as WordKey[];

/**
 * The placeholder names a template fills, ignoring any `|modifier`.
 *
 * @param template - A dictionary value
 * @returns The sorted placeholder names
 */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)(?:\|[^}]+)?\}/g)].map(match => match[1]).sort();
}

describe('the Mermaid adapter\'s words', () => {
  it('should be written for every language MAIDR speaks', () => {
    expect(Object.keys(WORDS).sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    const words = WORDS[locale] as Record<WordKey, string>;

    it('should have every word the English has, and no other', () => {
      expect(Object.keys(words).sort()).toEqual([...KEYS].sort());
    });

    it('should fill the placeholders the English fills, and only those', () => {
      expect(KEYS.filter(key => placeholders(words[key]).join() !== placeholders(english[key]).join())).toEqual([]);
    });

    it('should leave no word blank', () => {
      expect(KEYS.filter(key => words[key].trim() === '')).toEqual([]);
    });

    // A node carries several attributes, keyed by name: two names the same
    // would write one attribute over the other. The Wardley map's two axes
    // are attribute names of its value chain too.
    it('should give every attribute a name of its own', () => {
      const names = [...KEYS.filter(key => key.startsWith('attribute.')), 'wardley.evolution', 'wardley.visibility']
        .map(key => words[key as WordKey]);

      expect(new Set(names).size).toBe(names.length);
    });

    // The description's table heads its column of names with what the
    // diagram calls its nodes, beside a column per attribute: a class
    // diagram's note has its Kind beside the Class column.
    it('should name no attribute as a diagram names its nodes', () => {
      const nouns = new Set(KEYS.filter(key => key.startsWith('node.')).map(key => words[key]));

      const clashing = KEYS.filter(key => key.startsWith('attribute.') && nouns.has(words[key]));

      expect(clashing).toEqual([]);
    });

    if (locale !== 'ko') {
      it('should not use Korean particle modifiers', () => {
        expect(KEYS.filter(key => /\{\w+\|[^}]+\}/.test(words[key]))).toEqual([]);
      });
    }

    if (locale !== 'en') {
      it('should translate most words rather than copy the English', () => {
        const worded = KEYS.filter(key => /[A-Z]{4,}/i.test(english[key]));
        const copied = worded.filter(key => words[key] === english[key]);

        // Proper nouns, loanwords and the notation's keywords stay as they
        // are, but the bulk must move.
        expect(copied.length / worded.length).toBeLessThan(0.15);
      });
    }
  });
});

describe('sayIn', () => {
  it('should fill a word\'s placeholders, with a Korean particle where it asks for one', () => {
    expect(sayIn('en')('railroad.repeatedBetween', { min: 1, max: 3 })).toBe('repeated 1 to 3 times');
    expect(sayIn('ko')('block.and', { first: '왼쪽', second: '오른쪽' })).toBe('왼쪽과 오른쪽');
    expect(sayIn('ko')('block.and', { first: '위', second: '아래' })).toBe('위와 아래');
  });
});

describe('sayKnown', () => {
  it('should word a value Mermaid knows, and keep one it does not as written', () => {
    const say = sayIn('de');
    const known = { up: 'block.up' } as const;

    expect(sayKnown('up', known, say)).toBe('oben');
    expect(sayKnown('sideways', known, say)).toBe('sideways');
    // Not a key of the set's prototype either.
    expect(sayKnown('constructor', known, say)).toBe('constructor');
  });
});
