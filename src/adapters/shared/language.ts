/**
 * The language a diagram adapter writes its own words in, and keeping them in
 * the language MAIDR speaks.
 *
 * MAIDR translates what it says itself as it says it. An adapter's words are
 * different: what a diagram calls its nodes, the kind each one is, the names
 * of their attributes are written into the chart data the adapter hands MAIDR,
 * and MAIDR reads chart data as written. So the adapter writes them in the
 * reader's language, and writes them again when the reader changes it.
 */

import type { Maidr } from '@type/grammar';
import type { LanguageChangeDetail, Locale } from '@util/i18n/locale';
import { isLocale, LANGUAGE_CHANGE_EVENT, SUPPORTED_LOCALES } from '@util/i18n/locale';
import { readerLocale } from '@util/i18n/readerLocale';

/**
 * The language an adapter writes in: the one its caller gave, or else the
 * one MAIDR speaks to the reader.
 *
 * @param given - The caller's `language` option, unchecked
 * @param adapter - The adapter's name, for the warning a bad option earns
 * @returns The locale
 */
export function adapterLocale(given: unknown, adapter: string): Locale {
  if (given === undefined) {
    return readerLocale();
  }
  if (isLocale(given)) {
    return given;
  }
  console.warn(
    `[maidr/${adapter}] Ignoring language ${JSON.stringify(given)}: expected one of `
    + `${SUPPORTED_LOCALES.join(', ')}. Writing in the reader's language instead.`,
  );
  return readerLocale();
}

/** A chart whose words follow the reader's language. */
interface Follower {
  /** The language its words were last written in. */
  language: Locale;
  /** The chart data last handed to MAIDR, as JSON. */
  json: string;
  /** Converts the chart again, writing its words in a language. */
  reconvert: (language: Locale) => Maidr | Promise<Maidr>;
}

/** Every chart following the reader's language, by the element it is bound on. */
const followers = new Map<Element, Follower>();

/** Re-conversions waiting their turn: one at a time, in the order asked for. */
let queue: Promise<void> = Promise.resolve();

let listening = false;

/**
 * The language a {@link LANGUAGE_CHANGE_EVENT} says MAIDR now speaks.
 *
 * @param event - The event
 * @returns The locale, or undefined when the event carries none
 */
function languageOf(event: Event): Locale | undefined {
  const detail = (event as CustomEvent<Partial<LanguageChangeDetail> | null>).detail;
  return isLocale(detail?.language) ? detail.language : undefined;
}

/**
 * Hands MAIDR a chart's new data in place of what it was bound with.
 *
 * Through `window.maidrLive.setData`, not the `maidr` attribute: MAIDR takes
 * a changed attribute for a new chart and builds it again from nothing,
 * taking the reader's focus with it when they are in it. New data reaches a
 * chart the reader is in when they next enter it, at the point they left.
 *
 * @param element - Where the chart is bound
 * @param maidr - Its new data
 */
function handOver(element: Element, maidr: Maidr): void {
  const live = (globalThis as { maidrLive?: { setData?: (data: Maidr) => boolean } }).maidrLive;
  // Only a chart the page handed MAIDR through the attribute is one this
  // adapter knows MAIDR shows; a figure the caller kept is theirs to place.
  if (element.hasAttribute('maidr') && typeof live?.setData === 'function') {
    live.setData(maidr);
  }
}

/**
 * Writes every following chart's words again in a language.
 *
 * A chart whose data comes out the same -- one with no words of the adapter's
 * in it -- is not handed over, since new data costs the reader the place they
 * last left that chart at.
 *
 * @param language - The language MAIDR speaks now
 */
async function rewrite(language: Locale): Promise<void> {
  for (const [element, follower] of [...followers]) {
    if (!element.isConnected) {
      followers.delete(element);
      continue;
    }
    if (follower.language === language) {
      continue;
    }
    try {
      const maidr = await follower.reconvert(language);
      follower.language = language;
      const json = JSON.stringify(maidr);
      if (json !== follower.json) {
        follower.json = json;
        handOver(element, maidr);
      }
    } catch (error) {
      console.error('[maidr] Could not write a diagram\'s words in the new language.', error);
    }
  }
}

/**
 * Starts listening for MAIDR's language changes, once per bundle.
 */
function listen(): void {
  if (listening || typeof document === 'undefined') {
    return;
  }
  listening = true;
  document.addEventListener(LANGUAGE_CHANGE_EVENT, (event) => {
    const language = languageOf(event);
    if (language !== undefined) {
      queue = queue.then(() => rewrite(language));
    }
  });
}

/**
 * Keeps a chart's words in the language MAIDR speaks: when the reader changes
 * it, the chart is converted again and MAIDR handed the result.
 *
 * Charts no longer in the page are let go as others are added, so a page
 * that draws its diagrams again and again holds on to none of the old ones.
 *
 * @param element - Where the chart is bound
 * @param language - The language its words are written in now
 * @param maidr - The chart data written in it
 * @param reconvert - Converts the chart again in another language
 */
export function followReaderLanguage(
  element: Element,
  language: Locale,
  maidr: Maidr,
  reconvert: (language: Locale) => Maidr | Promise<Maidr>,
): void {
  for (const bound of [...followers.keys()]) {
    if (!bound.isConnected) {
      followers.delete(bound);
    }
  }
  followers.set(element, { language, json: JSON.stringify(maidr), reconvert });
  listen();
}

/**
 * Stops a chart following the reader's language, for a caller that has
 * converted it again with a language of its own.
 *
 * @param element - Where the chart is bound
 */
export function stopFollowingReaderLanguage(element: Element): void {
  followers.delete(element);
}

/**
 * Waits for every re-conversion asked for so far. For tests.
 *
 * @returns A promise settled once the queue is empty
 */
export function languageRewritesSettled(): Promise<void> {
  return queue;
}
