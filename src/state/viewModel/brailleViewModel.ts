import type { PayloadAction } from '@reduxjs/toolkit';
import type { BrailleService } from '@service/braille';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * Represents the state of the braille display.
 */
export interface BrailleState {
  value: string;
  index: number;
}

const initialState: BrailleState = {
  value: '',
  index: -1,
};

const brailleSlice = createSlice({
  name: 'braille',
  initialState,
  reducers: {
    update(_, action: PayloadAction<BrailleState>): BrailleState {
      return action.payload;
    },
    reset(): BrailleState {
      return initialState;
    },
  },
});
const { update, reset } = brailleSlice.actions;

/**
 * View model for managing braille display state and interactions.
 */
export class BrailleViewModel extends AbstractViewModel<BrailleState> {
  private readonly brailleService: BrailleService;

  /**
   * Creates a new BrailleViewModel instance and registers braille service listeners.
   * @param {AppStore} store - The Redux store instance.
   * @param {BrailleService} brailleService - The braille service for handling braille operations.
   */
  public constructor(store: AppStore, brailleService: BrailleService) {
    super(store);
    this.brailleService = brailleService;
    this.registerListener();
  }

  /**
   * Disposes the view model and resets braille state to initial values.
   */
  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  /**
   * Registers a listener to handle braille service changes and update the store.
   */
  private registerListener(): void {
    this.disposables.push(this.brailleService.onChange((e) => {
      this.store.dispatch(update(e));
    }));
  }

  /**
   * Gets the current braille state from the store.
   * @returns {BrailleState} The current braille state.
   */
  public get state(): BrailleState {
    return this.store.getState().braille;
  }

  /**
   * Moves the braille display to a specific index position.
   * @param {number} index - The target index position.
   */
  public moveToIndex(index: number): void {
    this.brailleService.moveToIndex(index);
  }

  /**
   * Updates the braille display with new trace state data.
   * @param {TraceState} state - The trace state to update with.
   */
  public update(state: TraceState): void {
    this.brailleService.update(state);
  }

  /**
   * Toggles the braille display visibility based on the provided trace state.
   * @param {TraceState} state - The trace state for toggling.
   */
  public toggle(state: TraceState): void {
    this.brailleService.toggle(state);
  }
}

export default brailleSlice.reducer;
