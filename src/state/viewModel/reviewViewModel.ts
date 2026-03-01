import type { PayloadAction } from '@reduxjs/toolkit';
import type { ReviewService } from '@service/review';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for the review feature containing the current review value.
 */
export interface ReviewState {
  value: string;
}

const initialState: ReviewState = {
  value: '',
};

const reviewSlice = createSlice({
  name: 'review',
  initialState,
  reducers: {
    update(state, action: PayloadAction<string>): void {
      state.value = action.payload;
    },
    reset(): ReviewState {
      return initialState;
    },
  },
});
const { update, reset } = reviewSlice.actions;

/**
 * ViewModel for managing the review feature that displays plot data summaries.
 */
export class ReviewViewModel extends AbstractViewModel<ReviewState> {
  private readonly reviewService: ReviewService;

  /**
   * Creates a new ReviewViewModel instance.
   * @param store - The Redux store for state management
   * @param reviewService - Service for managing review functionality
   */
  public constructor(store: AppStore, reviewService: ReviewService) {
    super(store);
    this.reviewService = reviewService;
    this.registerListener();
  }

  /**
   * Disposes the view model and resets review state.
   */
  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  /**
   * Registers event listeners for review service changes.
   */
  private registerListener(): void {
    this.disposables.push(this.reviewService.onChange((e) => {
      this.store.dispatch(update(e.value));
    }));
  }

  /**
   * Gets the current state of the review feature.
   * @returns The current ReviewState
   */
  public get state(): ReviewState {
    return this.store.getState().review;
  }

  /**
   * Toggles the visibility of the review modal.
   * @param state - The current trace state
   */
  public toggle(state: TraceState): void {
    this.reviewService.toggle(state);
  }
}

export default reviewSlice.reducer;
