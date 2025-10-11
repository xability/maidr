import type { PayloadAction } from '@reduxjs/toolkit';
import type { BrailleService } from '@service/braille';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

interface BrailleState {
  value: string;
  index: number;
  enabled: boolean;
}

const initialState: BrailleState = {
  value: '',
  index: -1,
  enabled: false,
};

const brailleSlice = createSlice({
  name: 'braille',
  initialState,
  reducers: {
    update(state, action: PayloadAction<Partial<BrailleState>>): BrailleState {
      return { ...state, ...action.payload } as BrailleState;
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
    super.dispose();
    this.store.dispatch(reset());
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
    const enabled = this.brailleService.toggle(state);
    this.store.dispatch(update({ enabled }));
  }
}

export default brailleSlice.reducer;
