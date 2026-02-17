import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { HelpMenuItem } from '@type/help';
import { COMMAND_DESCRIPTIONS, HELP_SCOPE_INCLUDES, SCOPED_KEYMAP } from '@service/keybinding';
import { Scope } from '@type/event';

/**
 * Scopes that should use another scope's help menu (for transient label scopes).
 */
const HELP_SCOPE_ALIASES: Partial<Record<Scope, Scope>> = {
  [Scope.TRACE_LABEL]: Scope.TRACE,
  [Scope.FIGURE_LABEL]: Scope.SUBPLOT,
};

/**
 * Generates help menu items for a given scope by reading the keymap
 * and looking up descriptions from COMMAND_DESCRIPTIONS.
 */
function generateHelpItems(scope: Scope): HelpMenuItem[] {
  // Collect all command keys available in this scope (+ included scopes)
  const availableCommands = new Set<string>(Object.keys(SCOPED_KEYMAP[scope]));
  const includes = HELP_SCOPE_INCLUDES[scope] ?? [];
  for (const includedScope of includes) {
    for (const key of Object.keys(SCOPED_KEYMAP[includedScope])) {
      availableCommands.add(key);
    }
  }

  // Build help items from COMMAND_DESCRIPTIONS, preserving its order
  const items: HelpMenuItem[] = [];
  const seenDescriptions = new Set<string>();

  for (const [commandKey, entry] of Object.entries(COMMAND_DESCRIPTIONS)) {
    if (!availableCommands.has(commandKey))
      continue;
    if (!entry || seenDescriptions.has(entry.description))
      continue;

    seenDescriptions.add(entry.description);

    // Use displayKey override, or derive from the keymap
    const displayKey = entry.displayKey ?? resolveHotkeyDisplay(commandKey, scope, includes);

    items.push({ description: entry.description, key: displayKey });
  }

  return items;
}

/**
 * Resolves the display string for a hotkey by looking it up in the scope's keymap.
 */
function resolveHotkeyDisplay(commandKey: string, scope: Scope, includes: Scope[]): string {
  const keymap = SCOPED_KEYMAP[scope] as Record<string, string>;
  if (commandKey in keymap) {
    return formatHotkey(keymap[commandKey]);
  }
  for (const includedScope of includes) {
    const includedKeymap = SCOPED_KEYMAP[includedScope] as Record<string, string>;
    if (commandKey in includedKeymap) {
      return formatHotkey(includedKeymap[commandKey]);
    }
  }
  return commandKey;
}

/**
 * Formats a raw hotkey string for user-friendly display.
 * Example: 'ctrl+,' → 'ctrl + ,'
 */
function formatHotkey(hotkey: string): string {
  return hotkey
    .split('+')
    .map(part => part.trim())
    .join(' + ');
}

/**
 * Service for managing context-sensitive help menus across different application scopes.
 */
export class HelpService {
  private readonly context: Context;
  private readonly display: DisplayService;

  /**
   * Creates a new HelpService instance.
   * @param context - The application context for determining current scope
   * @param display - The display service for toggling help UI
   */
  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  /**
   * Retrieves help menu items for the current application scope.
   * Items are auto-generated from COMMAND_DESCRIPTIONS and the scope's keymap.
   * @returns Array of help menu items for the current scope
   */
  public getMenuItems(): HelpMenuItem[] {
    const scope = HELP_SCOPE_ALIASES[this.context.scope] ?? this.context.scope;
    return generateHelpItems(scope);
  }

  /**
   * Toggles the visibility of the help menu interface.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.HELP);
  }
}
