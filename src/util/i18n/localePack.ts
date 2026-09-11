import type { Locale } from './index';
import { detectMaidrSource } from '@util/diagnostics';
import { isLocaleLoaded } from './index';

declare global {
  interface Window {
    /**
     * Where the locale packs are served from, for a page that does not keep
     * them beside `maidr.js`. A directory URL; `locale-<code>.js` is appended.
     */
    maidrLocaleBaseUrl?: string;
  }
}

/** The pack that carries a locale, relative to the directory `maidr.js` is in. */
export function localePackFilename(locale: Locale): string {
  return `locale-${locale}.js`;
}

/**
 * Works out where a locale's pack is served from.
 *
 * The packs ship beside `maidr.js`, so wherever the page loaded that from — a
 * CDN, its own assets, a `file://` export — locates them. An explicit
 * `window.maidrLocaleBaseUrl` wins, for the pages where the bundle's own URL
 * cannot be found or the packs live elsewhere.
 * @param locale - The locale whose pack to locate
 * @returns The pack's absolute URL, or null when nothing locates it
 */
export function resolveLocalePackUrl(locale: Locale): string | null {
  const override = typeof window === 'undefined' ? undefined : window.maidrLocaleBaseUrl;
  const base = override ? override.replace(/\/?$/, '/') : detectMaidrSource().url;
  if (!base) {
    return null;
  }
  try {
    return new URL(localePackFilename(locale), base).href;
  } catch {
    return null;
  }
}

const inFlight = new Map<Locale, Promise<boolean>>();

/**
 * The script for this URL already on the page, from the author or from an
 * earlier call, so it is never added twice.
 * @param url - The pack's absolute URL
 * @returns The matching script element, or null
 */
function alreadyOnPage(url: string): HTMLScriptElement | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');
  for (const script of scripts) {
    if (script.src === url) {
      return script;
    }
  }
  return null;
}

/**
 * Settles once a pack script has loaded or failed.
 *
 * Used for the author's own tag as much as for one added here: a tag that is
 * on the page but still downloading has not registered anything yet, and
 * answering "not loaded" for it would be wrong the moment it finishes.
 * @param script - The pack's script element
 * @param locale - The locale it carries
 * @returns Whether the locale is loaded once the script has settled
 */
function settled(script: HTMLScriptElement, locale: Locale): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    script.addEventListener('load', () => resolve(isLocaleLoaded(locale)), { once: true });
    script.addEventListener('error', () => {
      console.warn(`[maidr] Could not load the locale pack at ${script.src}; announcements stay in English.`);
      resolve(false);
    }, { once: true });
  });
}

/**
 * Loads a locale's pack if the page has not, so a reader who chose a language
 * hears it without the page author having added a script tag.
 *
 * English needs no pack. A pack already registered, in flight, or present as
 * a script tag is not fetched again. Resolves to whether the locale is loaded
 * once the attempt settles; a page with no locatable pack directory resolves
 * false with one warning, and MAIDR keeps speaking English.
 * @param locale - The locale to make available
 * @returns Whether the locale's dictionary is loaded
 */
export function ensureLocalePack(locale: Locale): Promise<boolean> {
  if (locale === 'en' || isLocaleLoaded(locale)) {
    return Promise.resolve(true);
  }
  const pending = inFlight.get(locale);
  if (pending) {
    return pending;
  }
  const url = typeof document === 'undefined' ? null : resolveLocalePackUrl(locale);
  if (!url) {
    console.warn(`[maidr] Cannot locate the locale pack for "${locale}"; add <script src="…/${localePackFilename(locale)}"> or set window.maidrLocaleBaseUrl.`);
    return Promise.resolve(false);
  }
  let script = alreadyOnPage(url);
  if (!script) {
    script = document.createElement('script');
    script.src = url;
    script.async = true;
    document.head.appendChild(script);
  }
  const attempt = settled(script, locale).finally(() => inFlight.delete(locale));
  inFlight.set(locale, attempt);
  return attempt;
}
