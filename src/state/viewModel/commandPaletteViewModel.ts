import type { PayloadAction } from '@reduxjs/toolkit';
import type { CommandPaletteService } from '@service/commandPalette';
import type { AppStore } from '@state/store';
import type { Keys } from '@type/event';
import { createSlice } from '@reduxjs/toolkit';
import { SCOPED_KEYMAP } from '@service/keybinding';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { Scope } from '@type/event';

interface CommandItem {
  key: string;
  description: string;
  commandKey: Keys;
}

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

export class CommandPaletteViewModel extends AbstractViewModel<CommandPaletteState> {
  private readonly commandPaletteService: CommandPaletteService;

  public constructor(store: AppStore, commandPaletteService: CommandPaletteService) {
    super(store);
    this.commandPaletteService = commandPaletteService;
  }

  public dispose(): void {
    super.dispose();
    this.store.dispatch(hide());
  }

  public get state(): CommandPaletteState {
    return this.store.getState().commandPalette;
  }

  public toggle(): void {
    const currentState = this.state;

    if (currentState.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

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

  public hide(): void {
    this.store.dispatch(hide());
    this.commandPaletteService.returnToTraceScope();
  }

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

  public moveDown(): void {
    const currentState = this.state;

    if (currentState.commands.length > 0) {
      // If no option is selected, start from the first option
      const currentIndex = currentState.selectedIndex >= 0 ? currentState.selectedIndex : -1;
      const newIndex = Math.min(currentState.commands.length - 1, currentIndex + 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  public moveToSearch(): void {
    // Deselect all options to return focus to search bar
    this.store.dispatch(updateSelectedIndex(-1));
    // Note: The component will handle focusing the search input via useEffect
  }

  public selectCurrent(): void {
    const currentState = this.state;

    if (currentState.commands.length > 0 && currentState.selectedIndex !== undefined) {
      // Don't automatically execute the command, just return it
      // The actual execution should be handled by the component
      // this.handleCommandSelect(command);
    }
  }

  public updateSearch(search: string): void {
    this.store.dispatch(updateSearch(search));
  }

  public executeCommand(_commandKey: Keys): void {
    // Execute the command via CommandExecutor
    // This will be called by the CommandPalette component
    this.hide();
  }

  private handleCommandSelect(_command: CommandItem): void {
    // Execute the selected command
    // This will be handled by the CommandPalette component
    this.hide();
  }

  private toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, txt =>
      txt.charAt(0).toUpperCase() + txt.slice(1));
  }
}

export default commandPaletteSlice.reducer;
