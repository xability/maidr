import type { StorageService } from '@service/storage';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { applyStoredLanguage } from '@service/settings';
import { DEFAULT_SETTINGS } from '@type/settings';
import { getLocale, setLocale } from '@util/i18n';
import { readerLocale } from '@util/i18n/readerLocale';
import { SETTINGS_KEY } from '@util/settingsKey';
import { stubNavigatorLanguages } from './navigatorLanguages';
// The core fetches the pack of the language it speaks; Korean's is here.
import '../../../src/locale/ko';

/**
 * The language MAIDR speaks to a reader when a chart loads, as a bundle other
 * than the core -- a diagram adapter -- reads it, before any chart exists to
 * say.
 */

/**
 * Settings as the reader saved them.
 *
 * @param saved - What is stored under the settings key, if anything
 * @returns Reads a stored value by key
 */
function stored(saved?: unknown): (key: string) => unknown {
  return key => (key === SETTINGS_KEY ? saved ?? null : null);
}

describe('readerLocale', () => {
  let restoreNavigator: () => void = () => {};

  beforeEach(() => {
    restoreNavigator = stubNavigatorLanguages(['de-AT', 'en-US']);
  });

  afterEach(() => {
    restoreNavigator();
    setLocale('en');
  });

  it('should be the language the reader chose', () => {
    expect(readerLocale(stored({ general: { language: 'ja' } }))).toBe('ja');
  });

  it('should follow the browser when the reader chose nothing, or nothing MAIDR knows', () => {
    expect(readerLocale(stored())).toBe('de');
    expect(readerLocale(stored({ general: {} }))).toBe('de');
    expect(readerLocale(stored({ general: { language: 'tlh' } }))).toBe('de');
    expect(readerLocale(stored('not settings'))).toBe('de');
  });

  it('should use the fallback given in place of following the browser', () => {
    expect(readerLocale(stored(), 'hi')).toBe('hi');
  });

  it('should follow the browser by default, as MAIDR\'s own default does', () => {
    expect(DEFAULT_SETTINGS.general.language).toBe('auto');
  });

  it('should agree with the language the core speaks from the same settings', () => {
    restoreNavigator();
    restoreNavigator = stubNavigatorLanguages(['ko-KR']);

    for (const saved of [undefined, { general: { language: 'en' } }, { general: { language: 'tlh' } }]) {
      const load = stored(saved);
      const storage = { load, save: () => {}, remove: () => {} } as unknown as StorageService;

      applyStoredLanguage(storage);

      expect(getLocale()).toBe(readerLocale(load));
    }
  });
});
