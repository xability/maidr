import type { PayloadAction } from '@reduxjs/toolkit';
import type { ReviewService } from '@service/review';
import type { AppStore } from '@state/store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface ReviewState {
  enabled: boolean;
  value: string;
}

const initialState: ReviewState = {
  enabled: false,
  value: '',
};

const reviewSlice = createSlice({
  name: 'review',
  initialState,
  reducers: {
    update(state, action: PayloadAction<string>): void {
      state.value = action.payload;
    },
    toggle(state, action: PayloadAction<boolean>): void {
      state.enabled = action.payload;
    },
    reset(): ReviewState {
      return initialState;
    },
  },
});
const { update, toggle, reset } = reviewSlice.actions;

export class ReviewViewModel extends AbstractViewModel<ReviewState> {
  private readonly reviewService: ReviewService;

  public constructor(store: AppStore, reviewService: ReviewService) {
    super(store);
    this.reviewService = reviewService;
    this.registerListeners();
  }

  public dispose(): void {
    this.store.dispatch(reset());
    super.dispose();
  }

  private registerListeners(): void {
    this.disposables.push(this.reviewService.onChange((e) => {
      this.store.dispatch(update(e.value));
    }));
  }

  public get state(): ReviewState {
    return this.store.getState().review;
  }

  public toggle(): void {
    const enabled = this.reviewService.toggle(this.state.enabled);
    this.store.dispatch(toggle(enabled));
  }
}

export default reviewSlice.reducer;
