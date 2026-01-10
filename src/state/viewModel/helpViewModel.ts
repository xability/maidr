import type { PayloadAction } from '@reduxjs/toolkit';
import type { HelpService } from '@service/help';
import type { HelpMenuItem } from '@type/help';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for the help menu containing available help items.
 */
interface HelpMenuState {
  items: HelpMenuItem[];
}

const initialState: HelpMenuState = {
  items: [],
};

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {
    setHelpItems(state, action: PayloadAction<HelpMenuItem[]>): void {
      state.items = action.payload;
    },
    reset(): HelpMenuState {
      return initialState;
    },
  },
});
const { setHelpItems, reset } = helpSlice.actions;

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
    this.helpService.toggle();
  }

  /**
   * Disposes the view model and resets help menu state.
   */
  public dispose(): void {
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
