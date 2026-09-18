import type { PayloadAction } from '@reduxjs/toolkit';
import type { HelpService } from '@service/help';
import type { HelpMenuItem } from '@type/help';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for the help menu containing available help items.
 */
export interface HelpMenuState {
  items: HelpMenuItem[];
  /**
   * What the dialog's live region says about the last shortcut change: the
   * new key, the conflict that refused it, or the default put back. Empty
   * when there is nothing to say.
   */
  status: string;
  /**
   * Bumped with every status, including one whose text repeats the last, so
   * the region re-announces a refusal the reader ran into twice.
   */
  statusRevision: number;
}

const initialState: HelpMenuState = {
  items: [],
  status: '',
  statusRevision: 0,
};

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {
    setHelpItems(state, action: PayloadAction<HelpMenuItem[]>): void {
      state.items = action.payload;
    },
    setStatus(state, action: PayloadAction<string>): void {
      state.status = action.payload;
      state.statusRevision += 1;
    },
    reset(): HelpMenuState {
      return initialState;
    },
  },
});
const { setHelpItems, setStatus, reset } = helpSlice.actions;

/**
 * ViewModel for managing the help menu and its display state.
 */
export class HelpViewModel extends AbstractViewModel<HelpMenuState> {
  private readonly helpService: HelpService;

  /**
   * Creates a new HelpViewModel instance.
   * @param store - The Redux store for state management
   * @param helpService - Service for managing help menu functionality
   */
  public constructor(store: AppStore, helpService: HelpService) {
    super(store);
    this.helpService = helpService;
  }

  /**
   * Toggles the visibility of the help menu.
   */
  public toggle(): void {
    const items = this.helpService.getMenuItems();
    this.store.dispatch(setHelpItems(items));
    this.store.dispatch(setStatus(''));
    this.helpService.toggle();
  }

  /**
   * Gives a command the shortcut the reader pressed, and refreshes the list.
   * @param commandKey - The command to rebind
   * @param combo - The new shortcut, as hotkeys-js would bind it
   */
  public rebind(commandKey: string, combo: string): void {
    this.applyResult(this.helpService.rebind(commandKey, combo));
  }

  /**
   * Puts a command's default shortcut back, and refreshes the list.
   * @param commandKey - The command to restore
   */
  public resetBinding(commandKey: string): void {
    this.applyResult(this.helpService.resetBinding(commandKey));
  }

  /**
   * Puts every default shortcut back, and refreshes the list.
   */
  public resetAllBindings(): void {
    this.applyResult(this.helpService.resetAllBindings());
  }

  /**
   * Says something to the reader without changing a shortcut: the prompt to
   * press a new one, or that the recording was cancelled.
   * @param message - What to announce
   */
  public announce(message: string): void {
    this.store.dispatch(setStatus(message));
  }

  private applyResult(result: { changed: boolean; message: string }): void {
    if (result.changed) {
      this.store.dispatch(setHelpItems(this.helpService.getMenuItems()));
    }
    this.store.dispatch(setStatus(result.message));
  }

  /**
   * Disposes the view model and resets help menu state.
   */
  public override dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  /**
   * Gets the current state of the help menu.
   * @returns The current HelpMenuState
   */
  public get state(): HelpMenuState {
    return this.store.getState().help;
  }
}

export default helpSlice.reducer;
