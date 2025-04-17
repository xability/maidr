import type { PayloadAction } from '@reduxjs/toolkit';
import type { DisplayService } from '@service/display';
import type { AppStore } from '@state/store';
import type { Focus } from '@type/event';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface DisplayState {
  focus: Focus | null;
}

const initialState: DisplayState = {
  focus: null,
};

const displaySlice = createSlice({
  name: 'display',
  initialState,
  reducers: {
    update(state, action: PayloadAction<Focus>): void {
      state.focus = action.payload;
    },
    reset(): DisplayState {
      return initialState;
    },
  },
});
const { update, reset } = displaySlice.actions;

export class DisplayViewModel extends AbstractViewModel<DisplayState> {
  private readonly displayService: DisplayService;

  public constructor(store: AppStore, displayService: DisplayService) {
    super(store);
    this.displayService = displayService;
    this.registerListeners();
  }

  public dispose(): void {
    this.store.dispatch(reset());
    super.dispose();
  }

  private registerListeners(): void {
    this.disposables.push(this.displayService.onChange((e) => {
      this.store.dispatch(update(e.value));
    }));
  }

  public get state(): DisplayState {
    return this.store.getState().display;
  }
}

export default displaySlice.reducer;
