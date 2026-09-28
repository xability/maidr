import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { KeybindingOverrides } from '@service/keybinding';
import type { SettingsService } from '@service/settings';
import type { KeybindingEntry } from '@type/event';
import type { HelpMenuItem, HelpSectionId, RebindResult } from '@type/help';
import type { Locale } from '@util/i18n';
import { findBindingConflict, getKeymapForScope, isRebindable, resolveOverrides } from '@service/keybinding';
import { Scope } from '@type/event';
import { HELP_SECTIONS } from '@type/help';
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
 * The scopes that can open help, in the order the settings dialog takes a
 * command's description from. TRACE first, so a command bound on a plot
 * and in the lobby is named the way it is on the plot.
 */
const REBINDABLE_SCOPES: readonly Scope[] = [Scope.TRACE, Scope.SUBPLOT, Scope.BRAILLE, Scope.CANDLESTICK_DELTA];

/**
 * Which group each command is listed under, and in what order within it.
 *
 * Within a group the rows run from the one a reader presses most to the one
 * they press least: left and right before up and down, since most charts run
 * along x; the current point before the labels behind `l`; forward autoplay
 * before the reverse and vertical ones. The group order is `HELP_SECTIONS`.
 *
 * Keyed by the keymap's command name, which a scope's own rows and the rows
 * behind the `l` chord both have, so a command lands in the same place in
 * every scope that binds it. A command missing here is still listed, under
 * "More", rather than dropped -- and the help tests fail on it, so the gap
 * is noticed before a reader sees it.
 */
const SECTION_ORDER: Readonly<Record<Exclude<HelpSectionId, 'other'>, readonly string[]>> = {
  navigate: [
    'MOVE_LEFT',
    'MOVE_RIGHT',
    'MOVE_UP',
    'MOVE_DOWN',
    'MOVE_TO_TRACE_CONTEXT',
    'MOVE_TO_LEFT_EXTREME',
    'MOVE_TO_RIGHT_EXTREME',
    'MOVE_TO_TOP_EXTREME',
    'MOVE_TO_BOTTOM_EXTREME',
    'MOVE_TO_NEXT_TRACE',
    'MOVE_TO_PREV_TRACE',
  ],
  hear: [
    'ANNOUNCE_POINT',
    'ANNOUNCE_POSITION',
    'TOGGLE_DESCRIPTION',
    'ANNOUNCE_TITLE',
    'ANNOUNCE_X',
    'ANNOUNCE_Y',
    'ANNOUNCE_Z',
    'ANNOUNCE_SUBTITLE',
    'ANNOUNCE_CAPTION',
  ],
  modes: [
    'TOGGLE_TEXT',
    'TOGGLE_AUDIO',
    'TOGGLE_BRAILLE',
    'TOGGLE_REVIEW',
    'TOGGLE_HIGH_CONTRAST',
    'TOGGLE_MONITOR',
  ],
  autoplay: [
    'AUTOPLAY_FORWARD',
    'AUTOPLAY_BACKWARD',
    'AUTOPLAY_UPWARD',
    'AUTOPLAY_DOWNWARD',
    'STOP_AUTOPLAY',
    'SPEED_UP_AUTOPLAY',
    'SPEED_DOWN_AUTOPLAY',
    'RESET_AUTOPLAY_SPEED',
  ],
  jump: [
    'GO_TO_EXTREMA_TOGGLE',
    'GO_TO_MIN_VALUE',
    'GO_TO_MAX_VALUE',
    'ROTOR_NEXT_NAV',
    'ROTOR_PREV_NAV',
  ],
  tools: [
    'TOGGLE_HELP',
    'TOGGLE_CHAT',
    'TOGGLE_COMMAND_PALETTE',
    'TOGGLE_SETTINGS',
  ],
  candlestick: [
    'TOGGLE_CANDLESTICK_DELTA_LAYER',
    'SELECT_CANDLESTICK_DELTA_REFERENCE',
    'EXIT_CANDLESTICK_DELTA',
  ],
  tactile: [
    'TACTILE_ZOOM_IN',
    'TACTILE_ZOOM_OUT',
    'TACTILE_RESET_ZOOM',
  ],
};

/** Each listed command's group and its place in the whole menu. */
const COMMAND_PLACEMENT: ReadonlyMap<string, { section: HelpSectionId; rank: number }> = new Map(
  HELP_SECTIONS
    .flatMap(section => section === 'other' ? [] : SECTION_ORDER[section].map(commandKey => ({ commandKey, section })))
    .map(({ commandKey, section }, rank) => [commandKey, { section, rank }]),
);

/**
 * The group a command is listed under.
 * @param commandKey - The keymap's name for the command
 * @returns Its group, or `other` for a command the table does not place
 */
function sectionOf(commandKey: string): HelpSectionId {
  return COMMAND_PLACEMENT.get(commandKey)?.section ?? 'other';
}

/**
 * Orders help rows by group, most-used first, keeping the keymap's order
 * among rows the table does not place.
 * @param rows - Each row with the command it runs
 * @returns The rows, sorted
 */
function sortBySection(rows: { commandKey: string; item: HelpMenuItem }[]): HelpMenuItem[] {
  const unplaced = COMMAND_PLACEMENT.size;
  const rankOf = (commandKey: string): number => COMMAND_PLACEMENT.get(commandKey)?.rank ?? unplaced;
  return rows
    .map((row, index) => ({ ...row, index }))
    .sort((a, b) => rankOf(a.commandKey) - rankOf(b.commandKey) || a.index - b.index)
    .map(row => row.item);
}

/**
 * Generates help menu items from a keymap configuration.
 * Each command gets its own entry (no grouping).
 *
 * A row the reader may rebind carries its command, so the dialog can offer
 * the change, and a row they already rebound carries the default it left,
 * so the dialog can say what "restore" would restore.
 * @param keymap - The keymap configuration object, overrides applied
 * @param defaults - The same keymap without them
 * @returns Each help menu item with the command it runs
 */
function generateHelpMenuFromKeymap(
  keymap: Record<string, KeybindingEntry>,
  defaults: Record<string, KeybindingEntry>,
): { commandKey: string; item: HelpMenuItem }[] {
  const items: { commandKey: string; item: HelpMenuItem }[] = [];

  for (const [commandKey, entry] of Object.entries(keymap)) {
    // Skip entries explicitly marked as hidden
    if (entry.showInHelp === false) {
      continue;
    }

    const item: HelpMenuItem = {
      description: t(entry.description),
      key: entry.helpKey ?? entry.hotkey,
      section: sectionOf(commandKey),
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
    items.push({ commandKey, item });
  }

  return items;
}

/**
 * Generates help menu items for a nested scope with entry key prefix.
 * Only includes commands that are unique to the nested scope (not in parent).
 * @param nestedKeymap - The nested scope keymap configuration
 * @param entryKey - The key used to enter the nested scope (e.g., 'l')
 * @param parentKeymap - The parent scope keymap to check for duplicates
 * @returns Each help menu item, key prefixed, with the command it runs
 */
function generateNestedScopeHelp(
  nestedKeymap: Record<string, KeybindingEntry>,
  entryKey: string,
  parentKeymap: Record<string, KeybindingEntry>,
): { commandKey: string; item: HelpMenuItem }[] {
  const items: { commandKey: string; item: HelpMenuItem }[] = [];
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
      commandKey,
      item: {
        description: t(entry.description),
        key: `${entryKey} ${hotkey}`,
        section: sectionOf(commandKey),
      },
    });
  }

  return items;
}

/**
 * Generates a complete help menu for a scope including nested scope entries,
 * grouped and ordered as `SECTION_ORDER` lays out.
 * @param scope - The parent scope
 * @param overrides - Shortcuts the reader has changed
 * @returns Array of help menu items
 */
function generateCompleteHelpMenu(scope: Scope, overrides: KeybindingOverrides): HelpMenuItem[] {
  const keymap = getKeymapForScope(scope, overrides);
  const rows = generateHelpMenuFromKeymap(keymap, getKeymapForScope(scope));

  // Add nested scope entries (only commands unique to nested scope)
  const nestedConfigs = NESTED_SCOPE_CONFIG[scope];
  if (nestedConfigs) {
    for (const config of nestedConfigs) {
      const nestedKeymap = getKeymapForScope(config.scope, overrides);
      const nestedItems = generateNestedScopeHelp(nestedKeymap, config.entryKey, keymap);
      rows.push(...nestedItems);
    }
  }

  return sortBySection(rows);
}

/**
 * Service for managing context-sensitive help menus across different application scopes.
 *
 * Also works out what changing a shortcut comes to (#189) -- the conflict
 * that refuses it, the message to announce, the overrides after it -- for
 * the settings dialog, which is where a reader changes one. The help menu
 * itself only lists the keys. Nothing is saved here: the dialog saves the
 * overrides with its other settings, which is what the keybinding service
 * observes to take them up, and what survives a reload.
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
   * @param settings - Where the reader's changed shortcuts are read from
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
   * Every shortcut the reader may change, once each, grouped and ordered as
   * the help menu orders them.
   *
   * For the settings dialog, which is where a shortcut is changed. It is not
   * tied to a scope the way the help menu is -- the dialog is open over the
   * chart, not in it -- so it gathers the rows of every scope that can open
   * help, the first scope to bind a command naming it.
   * @param overrides - The shortcuts as the dialog's unsaved edits have them
   * @returns The rebindable rows, with their effective keys
   */
  public getRebindableItems(overrides: KeybindingOverrides): HelpMenuItem[] {
    const effective = resolveOverrides(overrides);
    const seen = new Set<string>();
    const rows: { commandKey: string; item: HelpMenuItem }[] = [];
    for (const scope of REBINDABLE_SCOPES) {
      const keymap = getKeymapForScope(scope, effective);
      for (const row of generateHelpMenuFromKeymap(keymap, getKeymapForScope(scope))) {
        if (row.item.commandKey !== undefined && !seen.has(row.commandKey)) {
          seen.add(row.commandKey);
          rows.push(row);
        }
      }
    }
    return sortBySection(rows);
  }

  /**
   * Gives a command the shortcut the reader just pressed.
   *
   * Refused, with the reason spoken, when the shortcut already runs another
   * command anywhere this one is bound: two commands on one key would make
   * whichever hotkeys-js ran first the winner, silently, and the reader
   * would have lost a shortcut they did not mean to give up.
   *
   * Nothing is saved here. The settings dialog keeps the result with its
   * other unsaved edits, so Cancel takes a changed shortcut back like any
   * other setting.
   * @param commandKey - The command to rebind
   * @param combo - The new shortcut, as hotkeys-js would bind it
   * @param overrides - The shortcuts as the dialog's unsaved edits have them
   * @returns Whether anything changed, what to say, and the overrides now
   */
  public rebind(commandKey: string, combo: string, overrides: KeybindingOverrides): RebindResult {
    const description = this.describe(commandKey);
    if (!isRebindable(commandKey) || description === null) {
      return { changed: false, overrides, message: t('keybinding.helpUnsupportedKey') };
    }
    const wanted = normalizeCombo(combo);
    if (wanted.length === 0) {
      return { changed: false, overrides, message: t('keybinding.helpUnsupportedKey') };
    }

    const conflict = findBindingConflict(commandKey, wanted, overrides);
    if (conflict !== null) {
      return {
        changed: false,
        overrides,
        message: t('keybinding.helpConflict', { key: formatCombo(wanted), other: t(conflict.description) }),
      };
    }

    return {
      changed: true,
      overrides: { ...overrides, [commandKey]: wanted },
      message: t('keybinding.helpRebound', { action: description, key: formatCombo(wanted) }),
    };
  }

  /**
   * Puts a command's default shortcut back.
   * @param commandKey - The command to restore
   * @param overrides - The shortcuts as the dialog's unsaved edits have them
   * @returns Whether anything changed, what to say, and the overrides now
   */
  public resetBinding(commandKey: string, overrides: KeybindingOverrides): RebindResult {
    const description = this.describe(commandKey);
    if (description === null) {
      return { changed: false, overrides, message: t('keybinding.helpUnsupportedKey') };
    }
    // A row still at its default has nothing to restore. The recording
    // prompt offers Backspace on every row, so this is an ordinary way to
    // arrive here, and the honest answer is that nothing moved -- not that
    // Backspace is a key no shortcut may take.
    if (overrides[commandKey] === undefined) {
      return { changed: false, overrides, message: t('keybinding.helpRecordingCancelled') };
    }
    const { [commandKey]: _dropped, ...rest } = overrides;
    return {
      changed: true,
      overrides: rest,
      message: t('keybinding.helpResetOne', { action: description, key: this.defaultKeyOf(commandKey) }),
    };
  }

  /**
   * Puts every default shortcut back.
   * @param overrides - The shortcuts as the dialog's unsaved edits have them
   * @returns Whether anything changed, what to say, and the overrides now
   */
  public resetAllBindings(overrides: KeybindingOverrides): RebindResult {
    return {
      changed: Object.keys(overrides).length > 0,
      overrides: {},
      message: t('keybinding.helpResetAllDone'),
    };
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
