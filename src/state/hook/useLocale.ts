import type { Locale, MessageKey, MessageParams } from '@util/i18n';
import { getLocale, onLocaleChange, t } from '@util/i18n';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Registers a React subscription to locale changes.
 * @param onStoreChange - React's callback to re-render the subscriber
 * @returns The unsubscribe function
 */
function subscribe(onStoreChange: () => void): () => void {
  const subscription = onLocaleChange(onStoreChange);
  return () => subscription.dispose();
}

/**
 * What a component needs to speak the reader's language.
 */
export interface LocaleApi {
  /** The active locale, for `lang` attributes and locale-aware formatting. */
  locale: Locale;
  /** Renders a message in the active locale; see `t` in `@util/i18n`. */
  t: (key: MessageKey, params?: MessageParams) => string;
}

/**
 * The active locale and a translation function bound to it.
 *
 * Subscribes the component to locale changes, so a component that renders
 * `t('…')` re-renders in the new language the moment the settings save —
 * a module-level `t` alone would leave already-mounted dialogs in the old one.
 * @returns The active locale and its `t`
 */
export function useLocale(): LocaleApi {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  // Bound to `locale` so memoised callers see a new function per language.
  const translate = useCallback(
    (key: MessageKey, params?: MessageParams) => t(key, params),
    [locale],
  );
  return { locale, t: translate };
}
