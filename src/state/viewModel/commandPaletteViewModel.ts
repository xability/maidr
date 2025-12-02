import type { PayloadAction } from '@reduxjs/toolkit';
import type { CommandPaletteService } from '@service/commandPalette';
import type { AppStore } from '@state/store';
import type { Keys } from '@type/event';
import { createSlice } from '@reduxjs/toolkit';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { Scope } from '@type/event';

/**
 * Represents a single command item in the command palette.
 */
interface CommandItem {
  key: string;
  description: string;
  commandKey: Keys;
}

/**
 * Represents the state of the command palette interface.
 */
interface CommandPaletteState {
  visible: boolean;
  commands: CommandItem[];
  selectedIndex: number;
  search: string;
}

const initialState: CommandPaletteState = {
  visible: false,
  commands: [],
  selectedIndex: -1,
  search: '',
};

const commandPaletteSlice = createSlice({
  name: 'commandPalette',
  initialState,
  reducers: {
    show(state, action: PayloadAction<{ commands: CommandItem[]; scope: Scope }>): void {
      state.visible = true;
      state.commands = action.payload.commands;
      state.selectedIndex = -1;
      state.search = '';
    },
    hide(state): void {
      state.visible = false;
      state.commands = [];
      state.selectedIndex = -1;
      state.search = '';
    },
    updateSelectedIndex(state, action: PayloadAction<number>): void {
      state.selectedIndex = action.payload;
    },
    updateSearch(state, action: PayloadAction<string>): void {
      state.search = action.payload;
      state.selectedIndex = -1;
    },
  },
});

const { show, hide, updateSelectedIndex, updateSearch } = commandPaletteSlice.actions;

/**
 * View model for managing command palette state and navigation.
 */
export class CommandPaletteViewModel extends AbstractViewModel<CommandPaletteState> {
  private readonly commandPaletteService: CommandPaletteService;

  /**
   * Creates a new CommandPaletteViewModel instance.
   * @param {AppStore} store - The Redux store instance.
   * @param {CommandPaletteService} commandPaletteService - The command palette service for scope management.
   */
  public constructor(store: AppStore, commandPaletteService: CommandPaletteService) {
    super(store);
    this.commandPaletteService = commandPaletteService;
  }

  /**
   * Disposes the view model and hides the command palette.
   */
  public dispose(): void {
    super.dispose();
    this.store.dispatch(hide());
  }

  /**
   * Gets the current command palette state from the store.
   * @returns {CommandPaletteState} The current command palette state.
   */
  public get state(): CommandPaletteState {
    return this.store.getState().commandPalette;
  }

  /**
   * Toggles the visibility of the command palette.
   */
  public toggle(): void {
    const currentState = this.state;

    if (currentState.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Shows the command palette with available commands for the current scope.
   */
  public show(): void {
    // Get available commands for current scope
    const scopeKeymap = SCOPED_KEYMAP.TRACE; // Default to TRACE scope
    const commands = Object.entries(scopeKeymap)
      .filter(([commandKey]) => !commandKey.startsWith('ALLOW_'))
      .map(([commandKey, key]) => ({
        key,
        description: this.toTitleCase(commandKey.replace(/_/g, ' ').toLowerCase()),
        commandKey: commandKey as Keys,
      }));

    // Store the commands in the state first
    this.store.dispatch(show({ commands, scope: Scope.TRACE }));

    // Then change scope to show the modal
    this.commandPaletteService.toggle();
  }

  /**
   * Hides the command palette and returns to trace scope.
   */
  public hide(): void {
    this.store.dispatch(hide());
    this.commandPaletteService.returnToTraceScope();
  }

  /**
   * Moves the selection up in the command list.
   */
  public moveUp(): void {
    const currentState = this.state;

    if (currentState.commands.length > 0) {
      // If we're on the first option (index 0), don't move up - let the component handle going back to search
      if (currentState.selectedIndex === 0) {
        return; // Component will handle this case
      }

      // If no option is selected, start from the last option
      const currentIndex = currentState.selectedIndex >= 0 ? currentState.selectedIndex : currentState.commands.length - 1;
      const newIndex = Math.max(0, currentIndex - 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  /**
   * Moves the selection down in the command list.
   */
  public moveDown(): void {
    const currentState = this.state;

    if (currentState.commands.length > 0) {
      // If no option is selected, start from the first option
      const currentIndex = currentState.selectedIndex >= 0 ? currentState.selectedIndex : -1;
      const newIndex = Math.min(currentState.commands.length - 1, currentIndex + 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  /**
   * Deselects all options and returns focus to the search bar.
   */
  public moveToSearch(): void {
    // Deselect all options to return focus to search bar
    this.store.dispatch(updateSelectedIndex(-1));
    // Note: The component will handle focusing the search input via useEffect
  }

  /**
   * Selects the currently highlighted command without executing it.
   */
  public selectCurrent(): void {
    const currentState = this.state;

    if (currentState.commands.length > 0 && currentState.selectedIndex !== undefined) {
      // Don't automatically execute the command, just return it
      // The actual execution should be handled by the component
      // this.handleCommandSelect(command);
    }
  }

  /**
   * Updates the search filter text for the command palette.
   * @param {string} search - The search text to filter commands.
   */
  public updateSearch(search: string): void {
    this.store.dispatch(updateSearch(search));
  }

  /**
   * Executes the specified command and hides the command palette.
   * @param {Keys} _commandKey - The command key to execute.
   */
  public executeCommand(_commandKey: Keys): void {
    // Execute the command via CommandExecutor
    // This will be called by the CommandPalette component
    this.hide();
  }

  /**
   * Handles command selection and hides the palette.
   * @param {CommandItem} _command - The selected command item.
   */
  private handleCommandSelect(_command: CommandItem): void {
    // Execute the selected command
    // This will be handled by the CommandPalette component
    this.hide();
  }

  /**
   * Converts a string to title case format.
   * @param {string} str - The string to convert.
   * @returns {string} The title-cased string.
   */
  private toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, txt =>
      txt.charAt(0).toUpperCase() + txt.slice(1));
  }
}

export default commandPaletteSlice.reducer;
