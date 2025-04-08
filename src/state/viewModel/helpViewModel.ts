import type { PayloadAction } from '@reduxjs/toolkit';
import type { HelpService } from '@service/help';
import type { HelpMenuItem } from '@type/help';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

interface HelpMenuState {
  enabled: boolean;
  items: HelpMenuItem[];
}

const initialState: HelpMenuState = {
  enabled: false,
  items: [],
};

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {
    setHelpState(_, action: PayloadAction<HelpMenuState>): HelpMenuState {
      return action.payload;
    },
    reset(): HelpMenuState {
      return initialState;
    },
  },
});
const { setHelpState, reset } = helpSlice.actions;

export class HelpViewModel extends AbstractViewModel<HelpMenuState> {
  private readonly helpService: HelpService;

  public constructor(store: AppStore, helpService: HelpService) {
    super(store);
    this.helpService = helpService;
  }

  public toggle(): void {
    const currentState = this.state.enabled;
    const enabled = this.helpService.toggle(currentState);
    const items = this.helpService.getMenuItems();

    this.store.dispatch(setHelpState({ enabled, items }));
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
