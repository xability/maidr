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
    visible: true,
    value: '',
  },
};

const displaySlice = createSlice({
  name: 'display',
  initialState,
  reducers: {
    updateFocus(state, action: PayloadAction<Focus>): void {
      state.focus = action.payload;
    },
    toggleTooltip(state, action: PayloadAction<string>): void {
      state.tooltip = { ...state.tooltip, visible: !state.tooltip.visible, value: action.payload };
    },
  },
});
const { updateFocus, toggleTooltip } = displaySlice.actions;

export class DisplayViewModel extends AbstractViewModel<DisplayState> {
  private readonly displayService: DisplayService;
  public readonly plot: HTMLElement;

  public constructor(store: AppStore, displayService: DisplayService) {
    super(store);

    this.displayService = displayService;
    this.plot = displayService.plot;

    this.registerListeners();
    this.store.dispatch(toggleTooltip(this.displayService.getInstruction()));
  }

  public dispose(): void {
    this.store.dispatch(toggleTooltip(this.displayService.getInstruction()));
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
