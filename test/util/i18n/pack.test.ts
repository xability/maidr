import type { MessageKey } from '@util/i18n';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { en } from '@util/i18n/en';

type Messages = Readonly<Record<MessageKey, string>>;

const GLOBAL = globalThis as unknown as { maidrLocales?: unknown };

/**
 * A dictionary that answers every key with a marker, enough to tell one
 * registration from another.
 * @param marker - The text every message renders as
 * @returns A complete dictionary
 */
function stub(marker: string): Messages {
  return Object.fromEntries(Object.keys(en).map(key => [key, marker])) as Messages;
}

describe('locale packs', () => {
  afterEach(() => {
    jest.resetModules();
    delete GLOBAL.maidrLocales;
  });

  it('should register a pack queued before the core bundle runs', async () => {
    const pack = await import('@util/i18n/pack');
    pack.registerLocalePack('ko', stub('queued'));

    const i18n = await import('@util/i18n');

    expect(i18n.isLocaleLoaded('ko')).toBe(true);
    expect(i18n.tIn('ko', 'settings.title')).toBe('queued');
  });

  it('should register a pack pushed after the core bundle runs', async () => {
    const i18n = await import('@util/i18n');
    const pack = await import('@util/i18n/pack');
    expect(i18n.isLocaleLoaded('ja')).toBe(false);

    pack.registerLocalePack('ja', stub('late'));

    expect(i18n.isLocaleLoaded('ja')).toBe(true);
    expect(i18n.tIn('ja', 'settings.title')).toBe('late');
  });

  it('should speak English until the active locale has a pack, then switch', async () => {
    const i18n = await import('@util/i18n');
    const pack = await import('@util/i18n/pack');
    const listener = jest.fn();
    i18n.onLocaleChange(listener);
    i18n.setLocale('fr');

    expect(i18n.t('settings.title')).toBe(en['settings.title']);

    pack.registerLocalePack('fr', stub('bonjour'));

    expect(i18n.t('settings.title')).toBe('bonjour');
    expect(listener).toHaveBeenLastCalledWith('fr');
    i18n.setLocale('en');
  });

  it('should not notify listeners for a pack the reader is not using', async () => {
    const i18n = await import('@util/i18n');
    const pack = await import('@util/i18n/pack');
    const listener = jest.fn();
    i18n.onLocaleChange(listener);

    pack.registerLocalePack('de', stub('hallo'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('should ignore a pack for a locale it does not know', async () => {
    const i18n = await import('@util/i18n');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    i18n.registerLocale('tlh' as never, stub('nuqneH'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(i18n.dictionary('tlh' as never)).toBeUndefined();
    warn.mockRestore();
  });

  it('should hand packs to every bundle that adopts the queue', async () => {
    const pack = await import('@util/i18n/pack');
    const first = jest.fn();
    const second = jest.fn();
    pack.adoptLocalePacks(first);
    pack.adoptLocalePacks(second);

    pack.registerLocalePack('it', stub('ciao'));

    expect(first).toHaveBeenCalledWith('it', expect.anything());
    expect(second).toHaveBeenCalledWith('it', expect.anything());
  });
});
