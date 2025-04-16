import type { PayloadAction } from '@reduxjs/toolkit';
import type { HelpService } from '@service/help';
import type { HelpMenuItem } from '@type/help';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

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

export class HelpViewModel extends AbstractViewModel<HelpMenuState> {
  private readonly helpService: HelpService;

  public constructor(store: AppStore, helpService: HelpService) {
    super(store);
    this.helpService = helpService;
  }

  public toggle(): void {
    const items = this.helpService.getMenuItems();
    this.store.dispatch(setHelpItems(items));
    this.helpService.toggle();
  }

  public dispose(): void {
    this.store.dispatch(reset());
  }

  public get state(): HelpMenuState {
    return this.store.getState().help;
  }
}

export default helpSlice.reducer;

export class toggleHelpMenu {
}
