import type { Locale, MessageKey } from './index';

/**
 * A dictionary handed to MAIDR from outside the core bundle: the locale it
 * speaks and its messages, keyed like the English dictionary.
 */
export type LocalePack = readonly [locale: Locale, messages: Readonly<Record<MessageKey, string>>];

/** Where packs register, once the core bundle has adopted the queue. */
interface LocalePackQueue {
  push: (...packs: LocalePack[]) => number;
  /** Every pack seen so far, so a bundle adopting later can catch up. */
  readonly seen: readonly LocalePack[];
}

/**
 * The global the packs and the core bundle meet at.
 *
 * A locale pack is its own script, built and loaded apart from `maidr.js`, so
 * the two share no module instance. They share this global instead, the way a
 * `dataLayer` works: before the core bundle runs, it is a plain array the packs
 * push into; when the core runs it drains the array and swaps in an object
 * whose `push` registers immediately. Either load order therefore works.
 */
type LocalePackGlobal = LocalePack[] | LocalePackQueue;

const GLOBAL_KEY = 'maidrLocales';

function packGlobal(): { [GLOBAL_KEY]?: LocalePackGlobal } {
  return globalThis as unknown as { [GLOBAL_KEY]?: LocalePackGlobal };
}

/**
 * Offers a dictionary to whichever MAIDR bundle is on the page, now or later.
 *
 * This is the whole of what a locale pack does. It imports nothing from the
 * core bundle, which is what keeps a pack to the size of its dictionary.
 * @param locale - The locale the dictionary speaks
 * @param messages - Its messages, one per English key
 */
export function registerLocalePack(locale: Locale, messages: Readonly<Record<MessageKey, string>>): void {
  const holder = packGlobal();
  holder[GLOBAL_KEY] ??= [];
  holder[GLOBAL_KEY].push([locale, messages]);
}

/**
 * Takes over the pack queue for a registry.
 *
 * Packs queued before this call are handed to `register` at once; packs pushed
 * afterwards go straight through. A second bundle adopting the queue receives
 * every pack the first already took, and chains onto it for the rest, so two
 * MAIDR bundles on one page both hear every pack whenever it arrived.
 * @param register - Where a pack's dictionary goes
 */
export function adoptLocalePacks(register: (locale: Locale, messages: Readonly<Record<MessageKey, string>>) => void): void {
  const holder = packGlobal();
  const previous = holder[GLOBAL_KEY];
  const earlier = !Array.isArray(previous) && previous ? previous : null;
  const queued: LocalePack[] = Array.isArray(previous) ? previous : [...(earlier?.seen ?? [])];
  const seen: LocalePack[] = [...queued];
  holder[GLOBAL_KEY] = {
    seen,
    push: (...packs: LocalePack[]): number => {
      for (const pack of packs) {
        seen.push(pack);
        register(pack[0], pack[1]);
      }
      earlier?.push(...packs);
      return packs.length;
    },
  };
  for (const [locale, messages] of queued) {
    register(locale, messages);
  }
}
