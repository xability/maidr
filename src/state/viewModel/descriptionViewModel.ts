import type { PayloadAction } from '@reduxjs/toolkit';
import type { DescriptionService } from '@service/description';
import type { DescriptionState } from '@type/state';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for the chart description modal.
 */
export interface DescriptionMenuState {
  data: DescriptionState | null;
}

const initialState: DescriptionMenuState = {
  data: null,
};

const descriptionSlice = createSlice({
  name: 'description',
  initialState,
  reducers: {
    setDescription(state, action: PayloadAction<DescriptionState | null>): void {
      state.data = action.payload;
    },
    reset(): DescriptionMenuState {
      return initialState;
    },
  },
});
const { setDescription, reset } = descriptionSlice.actions;

/**
 * ViewModel for managing the chart description modal state.
 */
export class DescriptionViewModel extends AbstractViewModel<DescriptionMenuState> {
  private readonly descriptionService: DescriptionService;

  public constructor(store: AppStore, descriptionService: DescriptionService) {
    super(store);
    this.descriptionService = descriptionService;
  }

  /**
   * Toggles the description modal, fetching data on open.
   */
  public toggle(): void {
    const data = this.descriptionService.getDescription();
    this.store.dispatch(setDescription(data));
    this.descriptionService.toggle();
  }

  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  public get state(): DescriptionMenuState {
    return this.store.getState().description;
  }
}

export default descriptionSlice.reducer;
