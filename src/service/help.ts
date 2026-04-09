import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { KeybindingEntry } from '@type/event';
import type { HelpMenuItem } from '@type/help';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { Scope } from '@type/event';

/**
 * Generates help menu items from a keymap configuration.
 * Filters entries based on showInHelp flag and uses helpKey for display.
 * @param keymap - The keymap configuration object
 * @returns Array of help menu items
 */
function generateHelpMenuFromKeymap(keymap: Record<string, KeybindingEntry>): HelpMenuItem[] {
  const items: HelpMenuItem[] = [];
  const seenGroups = new Set<string>();

  for (const entry of Object.values(keymap)) {
    // Skip entries explicitly marked as hidden
    if (entry.showInHelp === false) {
      continue;
    }

    // Handle grouped entries - only show the first one with the group's helpKey
    if (entry.helpGroup) {
      if (seenGroups.has(entry.helpGroup)) {
        continue;
      }
      seenGroups.add(entry.helpGroup);
    }

    items.push({
      description: entry.description,
      key: entry.helpKey ?? entry.hotkey,
    });
  }

  return items;
}

/**
 * Additional help entries for key sequences (multi-step commands).
 * These represent commands that require entering a sub-scope first.
 */
const TRACE_LABEL_SEQUENCE_HELP: HelpMenuItem[] = [
  { description: 'Announce Plot Title', key: 'l t' },
  { description: 'Announce X Label', key: 'l x' },
  { description: 'Announce Y Label', key: 'l y' },
  { description: 'Announce Fill (Z) Label', key: 'l f' },
];

const FIGURE_LABEL_SEQUENCE_HELP: HelpMenuItem[] = [
  { description: 'Announce Plot Title', key: 'l t' },
  { description: 'Announce Subtitle', key: 'l s' },
  { description: 'Announce Caption', key: 'l c' },
];

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

    // Generate help menus from keymaps with additional sequence entries
    const traceHelpMenu = [
      ...generateHelpMenuFromKeymap(SCOPED_KEYMAP[Scope.TRACE] as unknown as Record<string, KeybindingEntry>),
      ...TRACE_LABEL_SEQUENCE_HELP,
    ];

    const subplotHelpMenu = [
      ...generateHelpMenuFromKeymap(SCOPED_KEYMAP[Scope.SUBPLOT] as unknown as Record<string, KeybindingEntry>),
      ...FIGURE_LABEL_SEQUENCE_HELP,
    ];

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
