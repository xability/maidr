import type { Locale, MessageKey, MessageParams } from '@util/i18n';
import { getLocale, getLocaleRevision, onLocaleChange, t } from '@util/i18n';
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
  /**
   * Advances whenever `t` would render differently: on a locale switch, and
   * when the active locale's pack arrives. A memo that caches rendered text
   * keys on this rather than on `locale`, which a late pack leaves unchanged.
   */
  revision: number;
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
  // The revision is the snapshot, not the locale: a pack registering for the
  // active locale changes every message without changing the locale string,
  // and a subscription keyed on the string would not re-render for it.
  const revision = useSyncExternalStore(subscribe, getLocaleRevision, getLocaleRevision);
  // Bound to `revision` so memoised callers see a new function per change.
  const translate = useCallback(
    (key: MessageKey, params?: MessageParams) => t(key, params),
    [revision],
  );
  return { locale: getLocale(), revision, t: translate };
}
