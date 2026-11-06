import type { Platform as PlatformHelper } from '@util/platform';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { dictionary, SUPPORTED_LOCALES, t } from '@util/i18n';
import { en } from '@util/i18n/en';
// Every dictionary is a locale pack, not part of the core, so load them all.
import '../../src/locale/all';

/**
 * A message that tells the reader to press a key with Alt in it names the key
 * their own keyboard has: Option on a Mac, Alt elsewhere. "Alt L" sent a Mac
 * reader to a key their keyboard does not call Alt.
 */

type Dictionary = Record<string, string>;

/**
 * The platform helper as a reader's browser loads it, on the platform its
 * navigator reports. The platform is read once, when the module loads, so
 * each load is a fresh one.
 *
 * @param navigatorPlatform - What `navigator.platform` reports
 * @returns The helper
 */
async function platformOn(navigatorPlatform: string): Promise<typeof PlatformHelper> {
  Object.defineProperty(navigator, 'platform', { configurable: true, get: () => navigatorPlatform });
  let loaded: typeof PlatformHelper | undefined;
  await jest.isolateModulesAsync(async () => {
    ({ Platform: loaded } = await import('@util/platform'));
  });
  if (loaded === undefined) {
    throw new Error('the platform helper did not load');
  }
  return loaded;
}

afterEach(() => {
  // Back to the navigator's own platform, which lives on its prototype.
  delete (navigator as { platform?: string }).platform;
});

describe('the alt key named to the reader', () => {
  it('is Option on a Mac', async () => {
    const Platform = await platformOn('MacIntel');

    const closed = t('notification.deltaClosed', { alt: Platform.altSpoken });

    expect(Platform.altSpoken).toBe('Option');
    expect(closed).toContain('Press Option L');
  });

  it('is Alt on other platforms', async () => {
    const Platform = await platformOn('Win32');

    const closed = t('notification.deltaClosed', { alt: Platform.altSpoken });

    expect(Platform.altSpoken).toBe('Alt');
    expect(closed).toContain('Press Alt L');
  });

  it('is named through the placeholder in every message that names it, in every locale', () => {
    // A message that wrote "Alt" itself would say it to a Mac reader too.
    const english = en as Dictionary;
    const namesAlt = Object.keys(english).filter(key => english[key].includes('{alt}'));

    const hardCoded = Object.keys(english).filter(key => key !== 'text.modifierAlt' && /\bAlt\b/.test(english[key]));
    const dropped = SUPPORTED_LOCALES.flatMap((locale) => {
      const messages = (dictionary(locale) ?? {}) as Dictionary;
      return namesAlt.filter(key => !messages[key]?.includes('{alt}')).map(key => `${locale} ${key}`);
    });

    expect(namesAlt.length).toBeGreaterThan(0);
    expect(hardCoded).toEqual([]);
    expect(dropped).toEqual([]);
  });
});
