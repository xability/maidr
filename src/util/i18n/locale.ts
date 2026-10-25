/**
 * Which language MAIDR speaks, without any dictionary.
 *
 * Kept apart from `./index`, which carries the English dictionary and adopts
 * the locale packs as it loads, so that a bundle needing only to know the
 * reader's language -- a diagram adapter, which writes its own words -- can
 * import this and nothing else.
 */

/**
 * A language MAIDR can speak. Every dictionary under `src/util/i18n/` has an
 * entry for every key of the English one, so any locale can render any
 * message.
 *
 * English ships inside the core bundle. Every other dictionary is a locale
 * pack — `dist/locale-ko.js`, or `maidr/locale/ko` from npm — registered
 * through `registerLocale`, so adding a language costs nothing to a page that
 * does not load it. A locale that is active but not registered renders in
 * English until its pack arrives.
 */
export type Locale = 'en' | 'ko' | 'ja' | 'zh' | 'es' | 'de' | 'fr' | 'it' | 'hi';

/**
 * The locales MAIDR knows a dictionary for, in the order the settings dialog
 * lists them. Knowing one is not the same as having it loaded; see
 * `isLocaleLoaded`.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'ko', 'ja', 'zh', 'es', 'de', 'fr', 'it', 'hi'];

/** The language before a preference is set and when the browser's is unknown. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * The language preference as stored in settings: a locale, or `auto` to
 * follow the browser.
 */
export type LanguageSetting = Locale | 'auto';

/**
 * The event MAIDR fires on the document each time the language it speaks
 * changes, with {@link LanguageChangeDetail} as its detail.
 *
 * For what MAIDR does not render itself: a diagram adapter writes words of
 * its own into the chart data, in the language MAIDR spoke when it drew the
 * chart, and listens for this to write them again in the new one.
 */
export const LANGUAGE_CHANGE_EVENT = 'maidr:languagechange';

/** The detail of a {@link LANGUAGE_CHANGE_EVENT}. */
export interface LanguageChangeDetail {
  /** The language MAIDR speaks from now on. */
  language: Locale;
}

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
