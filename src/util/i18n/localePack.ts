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
 * Scripts known to have fired `load` or `error` already. A script's element
 * does not say whether it has settled, and listening to it afterwards waits
 * for events that will not come again, so every settle is noted as it
 * happens, in the capture phase, where non-bubbling events still pass.
 */
const finished = new WeakSet<EventTarget>();
/** Scripts already on the page when this module ran, before it could listen. */
const preexisting = new WeakSet<HTMLScriptElement>();
if (typeof document !== 'undefined') {
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[src]')) {
    preexisting.add(script);
  }
  const note = (event: Event): void => {
    if (event.target) {
      finished.add(event.target);
    }
  };
  document.addEventListener('load', note, true);
  document.addEventListener('error', note, true);
}

/**
 * Whether a script has already loaded or failed. One seen settling is; one
 * that was on the page before this module is too once the document has
 * finished loading, since the load event waits for every such script.
 * @param script - The script element
 * @returns True when its `load` or `error` has already fired
 */
function hasSettled(script: HTMLScriptElement): boolean {
  return finished.has(script) || (preexisting.has(script) && document.readyState === 'complete');
}

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
    // A tag from before this module may have settled unseen; the page's
    // load event is the latest it can settle, so stop waiting there.
    if (preexisting.has(script)) {
      window.addEventListener('load', () => resolve(isLocaleLoaded(locale)), { once: true });
    }
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
  // A tag that has already settled without registering the locale (it
  // failed, or served something else) will fire nothing more: fetch afresh.
  if (script && hasSettled(script)) {
    script = null;
  }
  const added = !script;
  if (!script) {
    script = document.createElement('script');
    script.src = url;
    script.async = true;
    document.head.appendChild(script);
  }
  const own = script;
  // A failed script of ours is removed, so a later call fetches afresh
  // rather than waiting on events that have already fired.
  const attempt = settled(own, locale)
    .then((ok) => {
      if (!ok && added) {
        own.remove();
      }
      return ok;
    })
    .finally(() => inFlight.delete(locale));
  inFlight.set(locale, attempt);
  return attempt;
}
