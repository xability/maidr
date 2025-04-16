import type { PayloadAction } from '@reduxjs/toolkit';
import type { BrailleService } from '@service/braille';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface BrailleState {
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

export class BrailleViewModel extends AbstractViewModel<BrailleState> {
  private readonly brailleService: BrailleService;

  public constructor(store: AppStore, brailleService: BrailleService) {
    super(store);
    this.brailleService = brailleService;
    this.registerListener();
  }

  public dispose(): void {
    this.store.dispatch(reset());
    super.dispose();
  }

  private registerListener(): void {
    this.disposables.push(this.brailleService.onChange((e) => {
      this.store.dispatch(update(e));
    }));
  }

  public get state(): BrailleState {
    return this.store.getState().braille;
  }

  public moveToIndex(index: number): void {
    this.brailleService.moveToIndex(index);
  }

  public update(state: TraceState): void {
    this.brailleService.update(state);
  }

  public toggle(state: TraceState): void {
    this.brailleService.toggle(state);
  }
}

export default brailleSlice.reducer;
