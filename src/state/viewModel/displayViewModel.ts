import type { PayloadAction } from '@reduxjs/toolkit';
import type { DisplayService } from '@service/display';
import type { AppStore } from '@state/store';
import type { Focus } from '@type/event';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface TooltipState {
  visible: boolean;
  value: string;
}

interface DisplayState {
  focus: Focus | null;
  tooltip: TooltipState;
}

const initialState: DisplayState = {
  focus: null,
  tooltip: {
    visible: false,
    value: '',
  },
};

const displaySlice = createSlice({
  name: 'display',
  initialState,
  reducers: {
    hideTooltip(state): void {
      state.tooltip = { ...state.tooltip, visible: false, value: '' };
    },
    showTooltip(state, action: PayloadAction<string>): void {
      state.tooltip = { ...state.tooltip, visible: true, value: action.payload };
    },
    updateFocus(state, action: PayloadAction<Focus>): void {
      state.focus = action.payload;
    },
    clearFocus(state): void {
      state.focus = null;
    },
  },
});
const { hideTooltip, showTooltip, updateFocus, clearFocus } = displaySlice.actions;

export class DisplayViewModel extends AbstractViewModel<DisplayState> {
  private readonly displayService: DisplayService;

  public constructor(store: AppStore, displayService: DisplayService) {
    super(store);

    this.displayService = displayService;

    this.registerListeners();

    this.store.dispatch(hideTooltip());
  }

  public dispose(): void {
    // Clear only focus to avoid wiping other display UI state
    this.store.dispatch(clearFocus());
    this.store.dispatch(showTooltip(this.displayService.getInstruction()));
    super.dispose();
  }

  private registerListeners(): void {
    this.disposables.push(this.displayService.onChange((e) => {
      this.store.dispatch(updateFocus(e.value));
    }));
  }

  public get state(): DisplayState {
    return this.store.getState().display;
  }
}

export default displaySlice.reducer;
