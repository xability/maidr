import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { KeybindingEntry } from '@type/event';
import type { HelpMenuItem } from '@type/help';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { Scope } from '@type/event';

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
  [Scope.SUBPLOT]: [
    { scope: Scope.FIGURE_LABEL, entryKey: 'l' },
  ],
};

/**
 * Generates help menu items from a keymap configuration.
 * Each command gets its own entry (no grouping).
 * @param keymap - The keymap configuration object
 * @returns Array of help menu items
 */
function generateHelpMenuFromKeymap(keymap: Record<string, KeybindingEntry>): HelpMenuItem[] {
  const items: HelpMenuItem[] = [];

  for (const entry of Object.values(keymap)) {
    // Skip entries explicitly marked as hidden
    if (entry.showInHelp === false) {
      continue;
    }

    items.push({
      description: entry.description,
      key: entry.helpKey ?? entry.hotkey,
    });
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
      description: entry.description,
      key: `${entryKey} ${hotkey}`,
    });
  }

  return items;
}

/**
 * Generates a complete help menu for a scope including nested scope entries.
 * @param scope - The parent scope
 * @returns Array of help menu items
 */
function generateCompleteHelpMenu(scope: Scope): HelpMenuItem[] {
  const keymap = SCOPED_KEYMAP[scope] as unknown as Record<string, KeybindingEntry>;
  const items = generateHelpMenuFromKeymap(keymap);

  // Add nested scope entries (only commands unique to nested scope)
  const nestedConfigs = NESTED_SCOPE_CONFIG[scope];
  if (nestedConfigs) {
    for (const config of nestedConfigs) {
      const nestedKeymap = SCOPED_KEYMAP[config.scope] as unknown as Record<string, KeybindingEntry>;
      const nestedItems = generateNestedScopeHelp(nestedKeymap, config.entryKey, keymap);
      items.push(...nestedItems);
    }
  }

  return items;
}

/**
 * Service for managing context-sensitive help menus across different application scopes.
 */
export class HelpService {
  private readonly context: Context;
  private readonly display: DisplayService;

  private readonly scopedMenuItems: Partial<Record<Scope, HelpMenuItem[]>>;

  /**
   * Creates a new HelpService instance with auto-generated scoped menu configurations.
   * @param context - The application context for determining current scope
   * @param display - The display service for toggling help UI
   */
  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;

    // Auto-generate help menus from keymaps including nested scopes
    const traceHelpMenu = generateCompleteHelpMenu(Scope.TRACE);
    const subplotHelpMenu = generateCompleteHelpMenu(Scope.SUBPLOT);

    this.scopedMenuItems = {
      [Scope.TRACE]: traceHelpMenu,
      [Scope.TRACE_LABEL]: traceHelpMenu,
      [Scope.BRAILLE]: traceHelpMenu,
      [Scope.SUBPLOT]: subplotHelpMenu,
      [Scope.FIGURE_LABEL]: subplotHelpMenu,
    };
  }

  /**
   * Retrieves help menu items for the current application scope.
   * @returns Array of help menu items or empty array if no items for current scope
   */
  public getMenuItems(): HelpMenuItem[] {
    return this.scopedMenuItems[this.context.scope] ?? [];
  }

  /**
   * Toggles the visibility of the help menu interface.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.HELP);
  }
}
