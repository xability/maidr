import type { LanguageSetting, Locale } from './locale';
import { SETTINGS_KEY } from '../settingsKey';
import { isLanguageSetting, resolveLocale } from './locale';

/**
 * Reads the settings the reader saved, or nothing where the page has no
 * storage it may read: outside a browser, or in a frame whose storage is
 * blocked.
 *
 * @param key - The storage key
 * @returns The parsed value, or null
 */
function fromLocalStorage(key: string): unknown {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    return saved === null ? null : JSON.parse(saved);
  } catch {
    return null;
  }
}

/**
 * The language MAIDR speaks to this reader when a chart loads: the one they
 * chose in its settings, or else `fallback`, `auto` unless given, which
 * follows the browser.
 *
 * The core speaks it from the first chart's first render; a diagram adapter,
 * a bundle of its own that writes words into the chart data before that
 * render, reads it here so that the words it writes are in the same language.
 *
 * @param load - Reads a stored value by key. Local storage unless given
 * @param fallback - The preference when none is saved, or the saved one is
 *   not one MAIDR knows
 * @returns The locale
 */
export function readerLocale(
  load: (key: string) => unknown = fromLocalStorage,
  fallback: LanguageSetting = 'auto',
): Locale {
  const saved = load(SETTINGS_KEY);
  const general = typeof saved === 'object' && saved !== null
    ? (saved as { general?: unknown }).general
    : undefined;
  const language = typeof general === 'object' && general !== null
    ? (general as { language?: unknown }).language
    : undefined;
  return resolveLocale(isLanguageSetting(language) ? language : fallback);
}
