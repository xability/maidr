/**
 * @jest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { registerLocale, setLocale } from '@util/i18n';
import { en } from '@util/i18n/en';
import { ensureLocalePack, resolveLocalePackUrl } from '@util/i18n/localePack';

const CDN = 'https://cdn.example.test/npm/maidr@5.0.0/dist/';

/**
 * Pretends the page loaded maidr.js from a directory, the way the diagnostics
 * find it: from a script tag whose URL names the bundle.
 * @param base - The directory the bundle came from
 */
function loadedFrom(base: string): void {
  const script = document.createElement('script');
  script.src = `${base}maidr.js`;
  document.head.appendChild(script);
}

function packScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>('script[src*="locale-"]')];
}

describe('locale pack loading', () => {
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    document.head.innerHTML = '';
    delete window.maidrLocaleBaseUrl;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    setLocale('en');
  });

  it('should locate a pack beside the bundle the page loaded', () => {
    loadedFrom(CDN);

    expect(resolveLocalePackUrl('ko')).toBe(`${CDN}locale-ko.js`);
  });

  it('should prefer an explicit base URL', () => {
    loadedFrom(CDN);
    window.maidrLocaleBaseUrl = 'https://assets.example.test/maidr';

    expect(resolveLocalePackUrl('ja')).toBe('https://assets.example.test/maidr/locale-ja.js');
  });

  it('should add one script for a locale and resolve when it registers', async () => {
    loadedFrom(CDN);

    const first = ensureLocalePack('es');
    const second = ensureLocalePack('es');
    const [script] = packScripts();
    expect(packScripts()).toHaveLength(1);
    expect(script.src).toBe(`${CDN}locale-es.js`);
    registerLocale('es', en);
    script.dispatchEvent(new Event('load'));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('should report failure and keep English when the pack cannot load', async () => {
    loadedFrom(CDN);

    const attempt = ensureLocalePack('de');
    packScripts()[0].dispatchEvent(new Event('error'));

    await expect(attempt).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('should wait for a pack the author already put on the page rather than fetch it again', async () => {
    loadedFrom(CDN);
    const own = document.createElement('script');
    own.src = `${CDN}locale-fr.js`;
    document.head.appendChild(own);

    const attempt = ensureLocalePack('fr');
    expect(packScripts()).toHaveLength(1);
    registerLocale('fr', en);
    own.dispatchEvent(new Event('load'));

    await expect(attempt).resolves.toBe(true);
  });

  it('should warn once and stay English when the bundle location is unknown', async () => {
    await expect(ensureLocalePack('it')).resolves.toBe(false);

    expect(packScripts()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('should need no pack for English or a loaded locale', async () => {
    registerLocale('hi', en);

    await expect(ensureLocalePack('en')).resolves.toBe(true);
    await expect(ensureLocalePack('hi')).resolves.toBe(true);
    expect(packScripts()).toHaveLength(0);
  });
});
