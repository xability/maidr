import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { KeybindingOverrides } from '@service/keybinding';
import type { SettingsService } from '@service/settings';
import type { KeybindingEntry } from '@type/event';
import type { HelpMenuItem, RebindResult } from '@type/help';
import type { Locale } from '@util/i18n';
import { findBindingConflict, getKeymapForScope, isRebindable, resolveOverrides } from '@service/keybinding';
import { Scope } from '@type/event';
import { getLocale, t } from '@util/i18n';
import { formatCombo, normalizeCombo } from '@util/keyCombo';

/**
 * Configuration for nested scopes that are entered via a key from parent scope.
 */
interface NestedScopeConfig {
  scope: Scope;
  entryKey: string;
}

/**
 * Mapping of parent scopes to their nested scopes.
 */
const NESTED_SCOPE_CONFIG: Partial<Record<Scope, NestedScopeConfig[]>> = {
  [Scope.TRACE]: [
    { scope: Scope.TRACE_LABEL, entryKey: 'l' },
  ],
  [Scope.BRAILLE]: [
    { scope: Scope.TRACE_LABEL, entryKey: 'l' },
  ],
  [Scope.SUBPLOT]: [
    { scope: Scope.FIGURE_LABEL, entryKey: 'l' },
  ],
};

/**
 * Generates help menu items from a keymap configuration.
 * Each command gets its own entry (no grouping).
 *
 * A row the reader may rebind carries its command, so the dialog can offer
 * the change, and a row they already rebound carries the default it left,
 * so the dialog can say what "restore" would restore.
 * @param keymap - The keymap configuration object, overrides applied
 * @param defaults - The same keymap without them
 * @returns Array of help menu items
 */
function generateHelpMenuFromKeymap(
  keymap: Record<string, KeybindingEntry>,
  defaults: Record<string, KeybindingEntry>,
): HelpMenuItem[] {
  const items: HelpMenuItem[] = [];

  for (const [commandKey, entry] of Object.entries(keymap)) {
    // Skip entries explicitly marked as hidden
    if (entry.showInHelp === false) {
      continue;
    }

    const item: HelpMenuItem = {
      description: t(entry.description),
      key: entry.helpKey ?? entry.hotkey,
    };
    if (isRebindable(commandKey)) {
      item.commandKey = commandKey;
      const fallback = defaults[commandKey];
      const isCustom = fallback !== undefined && fallback.hotkey !== entry.hotkey;
      if (isCustom) {
        item.isCustom = true;
        item.defaultKey = fallback.helpKey ?? fallback.hotkey;
      }
    }
    items.push(item);
  }

  return items;
}

/**
 * Generates help menu items for a nested scope with entry key prefix.
 * Only includes commands that are unique to the nested scope (not in parent).
 * @param nestedKeymap - The nested scope keymap configuration
 * @param entryKey - The key used to enter the nested scope (e.g., 'l')
 * @param parentKeymap - The parent scope keymap to check for duplicates
 * @returns Array of help menu items with prefixed keys
 */
function generateNestedScopeHelp(
  nestedKeymap: Record<string, KeybindingEntry>,
  entryKey: string,
  parentKeymap: Record<string, KeybindingEntry>,
): HelpMenuItem[] {
  const items: HelpMenuItem[] = [];
  const parentCommandKeys = new Set(Object.keys(parentKeymap));

  for (const [commandKey, entry] of Object.entries(nestedKeymap)) {
    // Skip commands that exist in parent scope (they're not nested-specific)
    if (parentCommandKeys.has(commandKey)) {
      continue;
    }

    // Skip entries explicitly marked as hidden
    if (entry.showInHelp === false) {
      continue;
    }

    // Skip the exit/deactivate commands (they use 'escape')
    const hotkey = entry.helpKey ?? entry.hotkey;
    if (hotkey === 'escape' || hotkey === 'esc') {
      continue;
    }

    items.push({
      description: t(entry.description),
      key: `${entryKey} ${hotkey}`,
    });
  }

  return items;
}

/**
 * Generates a complete help menu for a scope including nested scope entries.
 * @param scope - The parent scope
 * @param overrides - Shortcuts the reader has changed
 * @returns Array of help menu items
 */
function generateCompleteHelpMenu(scope: Scope, overrides: KeybindingOverrides): HelpMenuItem[] {
  const keymap = getKeymapForScope(scope, overrides);
  const items = generateHelpMenuFromKeymap(keymap, getKeymapForScope(scope));

  // Add nested scope entries (only commands unique to nested scope)
  const nestedConfigs = NESTED_SCOPE_CONFIG[scope];
  if (nestedConfigs) {
    for (const config of nestedConfigs) {
      const nestedKeymap = getKeymapForScope(config.scope, overrides);
      const nestedItems = generateNestedScopeHelp(nestedKeymap, config.entryKey, keymap);
      items.push(...nestedItems);
    }
  }

  return items;
}

/**
 * Service for managing context-sensitive help menus across different application scopes.
 *
 * Also where a reader changes a shortcut (#189): the help menu is the list of
 * shortcuts, so it is where a reader looking for one finds the way to change
 * it. The change is saved through the settings, which is what the keybinding
 * service observes to take it up, and what survives a reload.
 */
export class HelpService {
  private readonly context: Context;
  private readonly display: DisplayService;
  private readonly settings: SettingsService | null;

  private scopedMenuItems: Partial<Record<Scope, HelpMenuItem[]>> | null;
  private menuLocale: Locale | null;
  private menuOverrides: KeybindingOverrides | null;

  /**
   * Creates a new HelpService instance.
   * @param context - The application context for determining current scope
   * @param display - The display service for toggling help UI
   * @param settings - Where a changed shortcut is kept; without it the menu is read-only
   */
  public constructor(context: Context, display: DisplayService, settings?: SettingsService) {
    this.context = context;
    this.display = display;
    this.settings = settings ?? null;
    this.scopedMenuItems = null;
    this.menuLocale = null;
    this.menuOverrides = null;
  }

  /** The reader's overrides as the settings hold them now. */
  private get overrides(): KeybindingOverrides {
    return resolveOverrides(this.settings?.loadSettings().general.keybindings);
  }

  /**
   * Auto-generates the help menus from the keymaps, including nested scopes.
   *
   * Braille mode gets its own menu rather than borrowing the trace one: its
   * keymap is a subset of TRACE, so reusing TRACE would advertise shortcuts
   * (the command palette, Go To Extrema, the candlestick reference keys)
   * that are not bound while the braille field has focus.
   * @param overrides - Shortcuts the reader has changed
   * @returns The menu items for every scope that can open help
   */
  private buildScopedMenuItems(overrides: KeybindingOverrides): Partial<Record<Scope, HelpMenuItem[]>> {
    const traceHelpMenu = generateCompleteHelpMenu(Scope.TRACE, overrides);
    const brailleHelpMenu = generateCompleteHelpMenu(Scope.BRAILLE, overrides);
    const subplotHelpMenu = generateCompleteHelpMenu(Scope.SUBPLOT, overrides);
    const candlestickDeltaHelpMenu = generateCompleteHelpMenu(Scope.CANDLESTICK_DELTA, overrides);

    // The label scopes are transient — the user is mid-chord after pressing
    // `l`, so they see the menu of the scope they came from.
    return {
      [Scope.TRACE]: traceHelpMenu,
      [Scope.TRACE_LABEL]: traceHelpMenu,
      [Scope.BRAILLE]: brailleHelpMenu,
      [Scope.SUBPLOT]: subplotHelpMenu,
      [Scope.FIGURE_LABEL]: subplotHelpMenu,
      [Scope.CANDLESTICK_DELTA]: candlestickDeltaHelpMenu,
    };
  }

  /**
   * Retrieves help menu items for the current application scope.
   *
   * Built on first use and kept until the language or the reader's
   * shortcuts change, so a reader who switches language sees the shortcut
   * list in the new one the next time they open help, and one who changes a
   * shortcut sees the new key at once.
   * @returns Array of help menu items or empty array if no items for current scope
   */
  public getMenuItems(): HelpMenuItem[] {
    const locale = getLocale();
    const overrides = this.overrides;
    if (
      this.scopedMenuItems === null
      || this.menuLocale !== locale
      || !sameOverrides(this.menuOverrides, overrides)
    ) {
      this.scopedMenuItems = this.buildScopedMenuItems(overrides);
      this.menuLocale = locale;
      this.menuOverrides = overrides;
    }
    return this.scopedMenuItems[this.context.scope] ?? [];
  }

  /**
   * Gives a command the shortcut the reader just pressed.
   *
   * Refused, with the reason spoken, when the shortcut already runs another
   * command anywhere this one is bound: two commands on one key would make
   * whichever hotkeys-js ran first the winner, silently, and the reader
   * would have lost a shortcut they did not mean to give up.
   * @param commandKey - The command to rebind
   * @param combo - The new shortcut, as hotkeys-js would bind it
   * @returns Whether anything changed, and what to say
   */
  public rebind(commandKey: string, combo: string): RebindResult {
    const description = this.describe(commandKey);
    if (this.settings === null || !isRebindable(commandKey) || description === null) {
      return { changed: false, message: t('keybinding.helpUnsupportedKey') };
    }
    const wanted = normalizeCombo(combo);
    if (wanted.length === 0) {
      return { changed: false, message: t('keybinding.helpUnsupportedKey') };
    }

    const overrides = this.overrides;
    const conflict = findBindingConflict(commandKey, wanted, overrides);
    if (conflict !== null) {
      return {
        changed: false,
        message: t('keybinding.helpConflict', { key: formatCombo(wanted), other: t(conflict.description) }),
      };
    }

    const next = { ...overrides, [commandKey]: wanted };
    this.saveOverrides(next);
    return {
      changed: true,
      message: t('keybinding.helpRebound', { action: description, key: formatCombo(wanted) }),
    };
  }

  /**
   * Puts a command's default shortcut back.
   * @param commandKey - The command to restore
   * @returns Whether anything changed, and what to say
   */
  public resetBinding(commandKey: string): RebindResult {
    const description = this.describe(commandKey);
    const overrides = this.overrides;
    if (this.settings === null || description === null || overrides[commandKey] === undefined) {
      return { changed: false, message: t('keybinding.helpUnsupportedKey') };
    }
    const { [commandKey]: _dropped, ...rest } = overrides;
    this.saveOverrides(rest);
    return {
      changed: true,
      message: t('keybinding.helpResetOne', { action: description, key: this.defaultKeyOf(commandKey) }),
    };
  }

  /**
   * Puts every default shortcut back.
   * @returns Whether anything changed, and what to say
   */
  public resetAllBindings(): RebindResult {
    if (this.settings === null || Object.keys(this.overrides).length === 0) {
      return { changed: false, message: t('keybinding.helpResetAllDone') };
    }
    this.saveOverrides({});
    return { changed: true, message: t('keybinding.helpResetAllDone') };
  }

  /**
   * Writes the overrides into the settings, which is what the keybinding
   * service observes and what the next page load reads.
   * @param overrides - The full set to keep
   */
  private saveOverrides(overrides: KeybindingOverrides): void {
    if (this.settings === null) {
      return;
    }
    const current = this.settings.loadSettings();
    this.settings.saveSettings({
      ...current,
      general: { ...current.general, keybindings: { ...overrides } },
    });
  }

  /**
   * The description of a command, from whichever scope binds it.
   * @param commandKey - The command
   * @returns Its description in the reader's language, or null for no such command
   */
  private describe(commandKey: string): string | null {
    for (const scope of Object.values(Scope)) {
      const entry = getKeymapForScope(scope)[commandKey];
      if (entry !== undefined) {
        return t(entry.description);
      }
    }
    return null;
  }

  /**
   * A command's default shortcut, spelled for the help menu.
   * @param commandKey - The command
   * @returns The default, or an empty string for no such command
   */
  private defaultKeyOf(commandKey: string): string {
    for (const scope of Object.values(Scope)) {
      const entry = getKeymapForScope(scope)[commandKey];
      if (entry !== undefined) {
        return entry.helpKey ?? entry.hotkey;
      }
    }
    return '';
  }

  /**
   * Toggles the visibility of the help menu interface.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.HELP);
  }
}

/**
 * Whether two sets of overrides bind the same shortcuts.
 * @param a - One set, or null for none built yet
 * @param b - The other
 * @returns True when every command has the same shortcut in both
 */
function sameOverrides(a: KeybindingOverrides | null, b: KeybindingOverrides): boolean {
  if (a === null) {
    return false;
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}
