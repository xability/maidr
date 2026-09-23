import { afterEach, describe, expect, it } from '@jest/globals';
import { chartGuide } from '@model/abstract';
import { TraceType } from '@type/grammar';
import { DEFAULT_LOCALE, setLocale, SUPPORTED_LOCALES } from '@util/i18n';
// Every dictionary is a locale pack, not part of the core, so load them all.
import '../../src/locale/all';

const TYPES = Object.values(TraceType);

describe('chartGuide', () => {
  afterEach(() => {
    setLocale(DEFAULT_LOCALE);
  });

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    it('should explain every chart type in all three parts', () => {
      setLocale(locale);

      const incomplete = TYPES.filter((type) => {
        const guide = chartGuide(type);
        return [guide.definition, guide.purpose, guide.appearance].some(text => text.trim() === '');
      });

      expect(incomplete).toEqual([]);
    });

    // A guide copied from a neighbouring type would pass the check above and
    // tell the reader about the wrong chart.
    it('should give every chart type its own explanation', () => {
      setLocale(locale);

      const definitions = TYPES.map(type => chartGuide(type).definition);

      expect(new Set(definitions).size).toBe(TYPES.length);
    });
  });
});
