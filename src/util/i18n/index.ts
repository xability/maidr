import type { Disposable } from '@type/disposable';
import { en } from './en';
import { attachJosa, isJosaPair } from './josa';
import { ko } from './ko';

/**
 * A language MAIDR can speak. Every dictionary under `src/util/i18n/` has an
 * entry for every key of the English one, so any locale can render any
 * message.
 */
export type Locale = 'en' | 'ko';

/** The locales offered, in the order the settings dialog lists them. */
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ko'];

/** The language before a preference is set and when the browser's is unknown. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Each locale named in itself, the way a language picker lists them: a reader
 * who does not read the current language can still find their own.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ko: '한국어',
};

/**
 * The language preference as stored in settings: a locale, or `auto` to
 * follow the browser.
 */
export type LanguageSetting = Locale | 'auto';

/** Every key the English dictionary defines; the other dictionaries follow it. */
export type MessageKey = keyof typeof en;

/** Values substituted into a message's `{placeholders}`. */
export type MessageParams = Record<string, string | number | undefined>;

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, ko };

let activeLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<(locale: Locale) => void>();

/**
 * Whether a value names a supported locale.
 * @param value - Any value, typically read from settings or the browser
 * @returns True when it is one of {@link SUPPORTED_LOCALES}
 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Whether a value is a valid language preference.
 * @param value - Any value, typically read from settings
 * @returns True for a supported locale or `auto`
 */
export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'auto' || isLocale(value);
}

/**
 * Picks the locale a language preference means.
 *
 * `auto` follows the first browser language MAIDR supports, matched on its
 * primary subtag so `ko-KR` finds Korean. When none match, English.
 * @param setting - The stored preference
 * @param browserLanguages - The browser's languages in preference order, `navigator.languages` by default
 * @returns The locale to speak
 */
export function resolveLocale(
  setting: LanguageSetting,
  browserLanguages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages ?? [],
): Locale {
  if (setting !== 'auto') {
    return setting;
  }
  for (const language of browserLanguages) {
    const primary = language.toLowerCase().split('-')[0];
    if (isLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_LOCALE;
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
 * Listeners registered with {@link onLocaleChange} are told only when the
 * locale actually changes, so re-saving settings does not re-render anything.
 * @param locale - The locale to switch to
 */
export function setLocale(locale: Locale): void {
  if (locale === activeLocale) {
    return;
  }
  activeLocale = locale;
  for (const listener of listeners) {
    listener(locale);
  }
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

const PLACEHOLDER = /\{(\w+)(?:\|([^}]+))?\}/g;

/**
 * Fills a message template's placeholders.
 *
 * `{name}` is replaced by the parameter of that name; an absent parameter
 * renders as nothing. `{name|은는}` additionally attaches the Korean particle
 * whose form suits the value — see `josa.ts`. Any other modifier is ignored,
 * so an English template that copies the placeholder still renders.
 * @param template - The message text with placeholders
 * @param params - The values to substitute
 * @returns The rendered message
 */
export function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(PLACEHOLDER, (_match, name: string, modifier?: string) => {
    const raw = params[name];
    const value = raw === undefined ? '' : String(raw);
    if (modifier && isJosaPair(modifier)) {
      return attachJosa(value, modifier);
    }
    return value;
  });
}

/**
 * Renders a message in the active locale.
 *
 * A key the active dictionary lacks — which the types prevent, but a locale
 * loaded at runtime could omit — falls back to English rather than to the
 * key, so the reader always hears words.
 * @param key - The message key
 * @param params - Values for the message's placeholders
 * @returns The rendered message
 */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = MESSAGES[activeLocale][key] ?? en[key];
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
  const template = MESSAGES[locale][key] ?? en[key];
  return interpolate(template, params);
}
