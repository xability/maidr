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
export interface CommandItem {
  key: string;
  description: string;
  commandKey: Keys;
}

/**
 * Represents the state of the command palette interface.
 */
export interface CommandPaletteState {
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
 * Callback type for executing commands.
 */
export type ExecuteCommandCallback = (commandKey: Keys) => void;

/**
 * View model for managing command palette state and navigation.
 */
export class CommandPaletteViewModel extends AbstractViewModel<CommandPaletteState> {
  private readonly commandPaletteService: CommandPaletteService;
  private executeCommandCallback: ExecuteCommandCallback | null = null;

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
   * Sets the command execution callback.
   * Called after CommandExecutor is created due to circular dependency.
   * @param {ExecuteCommandCallback} callback - The callback to execute commands.
   */
  public setExecuteCommandCallback(callback: ExecuteCommandCallback): void {
    this.executeCommandCallback = callback;
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
      .map(([commandKey, entry]) => ({
        key: entry.helpKey ?? entry.hotkey,
        description: entry.description,
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
   * Executes a command and closes the palette.
   * This is the single entry point for command execution from the palette.
   * @param {Keys} commandKey - The command key to execute.
   */
  public executeAndClose(commandKey: Keys): void {
    if (!this.executeCommandCallback) {
      throw new Error('Command execution callback not set. Call setExecuteCommandCallback first.');
    }

    const callback = this.executeCommandCallback;

    // Hide the palette first (returns to TRACE scope)
    this.hide();

    // Small delay to ensure scope has changed before executing
    setTimeout(() => {
      callback(commandKey);
    }, 0);
  }

  /**
   * Selects and executes the currently highlighted command.
   */
  public selectCurrent(): void {
    const currentState = this.state;

    if (currentState.commands.length > 0 && currentState.selectedIndex >= 0) {
      const command = currentState.commands[currentState.selectedIndex];
      if (command) {
        this.executeAndClose(command.commandKey);
      }
    }
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
   * Updates the search filter text for the command palette.
   * @param {string} search - The search text to filter commands.
   */
  public updateSearch(search: string): void {
    this.store.dispatch(updateSearch(search));
  }
}

export default commandPaletteSlice.reducer;
