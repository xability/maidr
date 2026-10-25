import type { Disposable } from '@type/disposable';
import type { MessageParams } from './interpolate';
import type { LanguageChangeDetail, Locale } from './locale';
import { en } from './en';
import { interpolate } from './interpolate';
import { DEFAULT_LOCALE, isLocale, LANGUAGE_CHANGE_EVENT } from './locale';
import { adoptLocalePacks } from './pack';

export { interpolate } from './interpolate';
export type { MessageParams } from './interpolate';
export {
  browserLanguages,
  DEFAULT_LOCALE,
  isLanguageSetting,
  isLocale,
  LANGUAGE_CHANGE_EVENT,
  resolveLocale,
  SUPPORTED_LOCALES,
} from './locale';
export type { LanguageChangeDetail, LanguageSetting, Locale } from './locale';

/**
 * Each locale named in itself, the way a language picker lists them: a reader
 * who does not read the current language can still find their own.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
  ja: '日本語',
  zh: '中文',
  es: 'Español',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  hi: 'हिन्दी',
};

/** Every key the English dictionary defines; the other dictionaries follow it. */
export type MessageKey = keyof typeof en;

const MESSAGES: Partial<Record<Locale, Readonly<Record<MessageKey, string>>>> = { en };

let activeLocale: Locale = DEFAULT_LOCALE;
let revision = 0;
const listeners = new Set<(locale: Locale) => void>();

function notify(): void {
  revision += 1;
  for (const listener of listeners) {
    listener(activeLocale);
  }
}

/**
 * A counter that advances every time what {@link t} would render changes:
 * on a locale switch, and when the active locale's pack registers.
 *
 * The locale alone is not enough for a subscriber to key on. A pack arriving
 * for the locale already active changes every message and leaves the locale
 * string as it was, so a React subscription keyed on the locale would see
 * nothing to re-render.
 * @returns The current revision
 */
export function getLocaleRevision(): number {
  return revision;
}

/**
 * Whether a locale's dictionary is present, so {@link t} can render it.
 * @param locale - The locale to check
 * @returns True for English and for any registered pack
 */
export function isLocaleLoaded(locale: Locale): boolean {
  return MESSAGES[locale] !== undefined;
}

/**
 * Adds a dictionary to the registry.
 *
 * When the dictionary is the one the active locale has been waiting for,
 * listeners are told, so every open dialog and the pre-activation
 * instruction re-render out of English and into the reader's language.
 * A dictionary for a locale MAIDR does not know is ignored with a warning
 * rather than thrown, since it arrives from a script the page author chose.
 * @param locale - The locale the dictionary speaks
 * @param messages - Its messages, one per English key
 */
export function registerLocale(locale: Locale, messages: Readonly<Record<MessageKey, string>>): void {
  if (!isLocale(locale)) {
    console.warn(`[maidr] Ignoring a locale pack for an unknown locale: ${String(locale)}`);
    return;
  }
  MESSAGES[locale] = messages;
  if (locale === activeLocale) {
    notify();
  }
}

adoptLocalePacks(registerLocale);

/**
 * Every message of a locale, as templates rather than rendered text.
 *
 * For tooling that checks the dictionaries against each other; code that
 * speaks to a reader goes through {@link t}.
 * @param locale - The locale whose dictionary to read
 * @returns The locale's templates by key
 */
export function dictionary(locale: Locale): Readonly<Record<MessageKey, string>> | undefined {
  return MESSAGES[locale];
}

/**
 * The locale messages are currently rendered in.
 * @returns The active locale
 */
export function getLocale(): Locale {
  return activeLocale;
}

/**
 * Switches the language every later {@link t} call renders in.
 *
 * Listeners registered with {@link onLocaleChange}, and the page through a
 * {@link LANGUAGE_CHANGE_EVENT}, are told only when the locale actually
 * changes, so re-saving settings does not re-render anything.
 * @param locale - The locale to switch to
 */
export function setLocale(locale: Locale): void {
  if (locale === activeLocale) {
    return;
  }
  activeLocale = locale;
  notify();
  announceLanguage(locale);
}

/**
 * Tells the page MAIDR now speaks a language, with a
 * {@link LANGUAGE_CHANGE_EVENT} on the document.
 *
 * Listeners inside this bundle hear of it through {@link onLocaleChange}. A
 * diagram adapter is a bundle of its own, sharing no module with this one,
 * and writes words of its own into the chart data it hands MAIDR; the event
 * is how it learns to write them again.
 * @param locale - The language MAIDR speaks from now on
 */
function announceLanguage(locale: Locale): void {
  if (typeof document === 'undefined' || typeof CustomEvent !== 'function') {
    return;
  }
  const detail: LanguageChangeDetail = { language: locale };
  document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail }));
}

/**
 * Registers a listener for locale changes.
 * @param listener - Called with the new locale after each change
 * @returns A disposable that unregisters the listener
 */
export function onLocaleChange(listener: (locale: Locale) => void): Disposable {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

/**
 * Renders a message in the active locale.
 *
 * A locale whose pack has not arrived, or a key a pack lacks, falls back to
 * English rather than to the key, so the reader always hears words.
 * @param key - The message key
 * @param params - Values for the message's placeholders
 * @returns The rendered message
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = MESSAGES[activeLocale]?.[key] ?? en[key];
  return interpolate(template, params);
}

/**
 * Renders a message in a specific locale, regardless of the active one.
 *
 * For the settings dialog, which names each language in itself, and for
 * tests that compare two renderings.
 * @param locale - The locale to render in
 * @param key - The message key
 * @param params - Values for the message's placeholders
 * @returns The rendered message
 */
export function tIn(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = MESSAGES[locale]?.[key] ?? en[key];
  return interpolate(template, params);
}
