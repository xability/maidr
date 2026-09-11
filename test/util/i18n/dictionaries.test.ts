import { dictionary, SUPPORTED_LOCALES } from '@util/i18n';
import { en } from '@util/i18n/en';

type Dictionary = Record<string, string>;

/**
 * Loads every dictionary through the same registry `t()` reads from, so a
 * locale that is declared but wired to the wrong module fails here.
 * @returns Each supported locale with its dictionary
 */
function dictionaries(): Array<[string, Dictionary]> {
  return SUPPORTED_LOCALES.map(locale => [locale, dictionary(locale) as Dictionary]);
}

/**
 * The placeholder names a template fills, ignoring any `|modifier`.
 * @param template - A dictionary value
 * @returns The sorted placeholder names
 */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)(?:\|[^}]+)?\}/g)].map(match => match[1]).sort();
}

describe('dictionaries', () => {
  const english = en as Dictionary;

  describe.each(dictionaries())('%s', (locale, dictionary) => {
    // A placeholder the English fills may be dropped where the language says
    // it another way -- Korean has no plural noun to fill `{noun}` with -- but
    // one the English does not fill would render as nothing.
    it('should fill only placeholders the English message fills', () => {
      const unknown = Object.keys(english).filter((key) => {
        const allowed = new Set(placeholders(english[key]));
        return placeholders(dictionary[key]).some(name => !allowed.has(name));
      });

      expect(unknown).toEqual([]);
    });

    it('should leave no message blank', () => {
      const blank = Object.keys(english).filter(
        key => english[key].trim() !== '' && dictionary[key].trim() === '',
      );

      expect(blank).toEqual([]);
    });

    if (locale !== 'ko') {
      it('should not use Korean particle modifiers', () => {
        const withJosa = Object.keys(english).filter(key => /\{\w+\|[^}]+\}/.test(dictionary[key]));

        expect(withJosa).toEqual([]);
      });
    }

    if (locale !== 'en') {
      it('should translate most messages rather than copy English', () => {
        const keys = Object.keys(english).filter(key => /[A-Z]{4,}/i.test(english[key]));
        const copied = keys.filter(key => dictionary[key] === english[key]);

        // Proper nouns and key names stay as they are, but the bulk must move.
        expect(copied.length / keys.length).toBeLessThan(0.15);
      });
    }
  });
});
