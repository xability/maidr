import type { Disposable } from '@type/disposable';
import { en } from './en';
import { attachJosa, isJosaPair } from './josa';
import { adoptLocalePacks } from './pack';

/**
 * A language MAIDR can speak. Every dictionary under `src/util/i18n/` has an
 * entry for every key of the English one, so any locale can render any
 * message.
 *
 * English ships inside the core bundle. Every other dictionary is a locale
 * pack — `dist/locale-ko.js`, or `maidr/locale/ko` from npm — registered
 * through {@link registerLocale}, so adding a language costs nothing to a
 * page that does not load it. A locale that is active but not registered
 * renders in English until its pack arrives.
 */
export type Locale = 'en' | 'ko' | 'ja' | 'zh' | 'es' | 'de' | 'fr' | 'it' | 'hi';

/**
 * The locales MAIDR knows a dictionary for, in the order the settings dialog
 * lists them. Knowing one is not the same as having it loaded; see
 * {@link isLocaleLoaded}.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ko', 'ja', 'zh', 'es', 'de', 'fr', 'it', 'hi'];

/** The language before a preference is set and when the browser's is unknown. */
export const DEFAULT_LOCALE: Locale = 'en';

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

/**
 * The language preference as stored in settings: a locale, or `auto` to
 * follow the browser.
 */
export type LanguageSetting = Locale | 'auto';

/** Every key the English dictionary defines; the other dictionaries follow it. */
export type MessageKey = keyof typeof en;

/** Values substituted into a message's `{placeholders}`. */
export type MessageParams = Record<string, string | number | undefined>;

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
 * The languages the browser asks for, in preference order.
 *
 * `navigator.languages` is the full list, but some embedded browsers leave
 * it empty and set only `navigator.language`; a reader there would otherwise
 * fall through to English no matter what their browser is set to.
 * @returns The browser's languages, or none outside a browser
 */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  const languages = navigator.languages ?? [];
  if (languages.length > 0) {
    return languages;
  }
  return navigator.language ? [navigator.language] : [];
}

/**
 * Picks the locale a language preference means.
 *
 * `auto` follows the first browser language MAIDR supports, matched on its
 * primary subtag so `ko-KR` finds Korean. When none match, English.
 * @param setting - The stored preference
 * @param languages - The browser's languages in preference order, {@link browserLanguages} by default
 * @returns The locale to speak
 */
export function resolveLocale(
  setting: LanguageSetting,
  languages: readonly string[] = browserLanguages(),
): Locale {
  if (setting !== 'auto') {
    return setting;
  }
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    if (isLocale(primary)) {
      return primary;
    }
  }
  return DEFAULT_LOCALE;
}

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
 * Listeners registered with {@link onLocaleChange} are told only when the
 * locale actually changes, so re-saving settings does not re-render anything.
 * @param locale - The locale to switch to
 */
export function setLocale(locale: Locale): void {
  if (locale === activeLocale) {
    return;
  }
  activeLocale = locale;
  notify();
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
