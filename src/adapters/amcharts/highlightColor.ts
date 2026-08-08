/**
 * Reads MAIDR's configured highlight color so the amCharts overlay matches the
 * other adapters. The overlay lives outside the MAIDR Controller (and its
 * Redux store), so we read the persisted setting directly from localStorage —
 * the same key/shape `SettingsService` writes — falling back to the default.
 *
 * Because settings persist to localStorage on save, reading this at draw time
 * reflects a user's highlight-color change on the next navigation.
 */

import type { Settings } from '@type/settings';
import { SETTINGS_KEY } from '@service/settings';
import { LocalStorageService } from '@service/storage';
import { DEFAULT_SETTINGS } from '@type/settings';

/**
 * Returns the current highlight color: the persisted `general.highlightColor`
 * setting, or the built-in default if none is stored.
 */
export function getHighlightColor(): string {
  try {
    const settings = new LocalStorageService().load<Settings>(SETTINGS_KEY);
    return settings?.general?.highlightColor ?? DEFAULT_SETTINGS.general.highlightColor;
  } catch {
    return DEFAULT_SETTINGS.general.highlightColor;
  }
}
