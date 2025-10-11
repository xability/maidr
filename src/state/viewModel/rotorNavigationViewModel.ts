import type { PayloadAction } from '@reduxjs/toolkit';
import type { DisplayService } from '@service/display';
import type { RotorNavigationService } from '@service/rotor';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';

interface RotorState {
  rotor_value: string | null;
}
const initialState: RotorState = {
  rotor_value: Constant.DATA_MODE,

};
const rotorNavigationSlice = createSlice({
  name: 'rotorNavigation',
  initialState,
  reducers: {
    show(): RotorState {
      return {
        rotor_value: '',
      };
    },
    setValue(state, action: PayloadAction<string | null>) {
      state.rotor_value = action.payload;
    },
  },
});
export const { setValue } = rotorNavigationSlice.actions;
export class RotorNavigationViewModel extends AbstractViewModel<RotorState> {
  private readonly rotorService: RotorNavigationService;
  private readonly displayService: DisplayService;

  public constructor(
    store: AppStore,
    rotorService: RotorNavigationService,
    displayService: DisplayService,
  ) {
    super(store);
    this.rotorService = rotorService;
    this.displayService = displayService;

    this.registerListeners();
  }

  public get state(): RotorState {
    return this.store.getState().rotor;
  }

  public toggle(state: TraceState): void {
    this.rotorService.toggle(state);
  }

  public moveToNextNavUnit(): void {
    const curr_mode = this.rotorService.moveToNextRotorUnit();
    this.store.dispatch(setValue(`${curr_mode}`));
  }

  public moveToPrevNavUnit(): void {
    const curr_mode = this.rotorService.moveToPrevRotorUnit();
    this.store.dispatch(setValue(`${curr_mode}`));
  }

  public moveUp(): void {
    this.store.dispatch(setValue(this.rotorService.moveUp()));
  }

  public moveLeft(): void {
    this.store.dispatch(setValue(this.rotorService.moveLeft()));
  }

  public moveDown(): void {
    this.store.dispatch(setValue(this.rotorService.moveDown()));
  }

  public moveRight(): void {
    this.store.dispatch(setValue(this.rotorService.moveRight()));
  }

  private registerListeners(): void {
    // When focus changes to any scope other than ROTOR, reset rotor_value to DATA_MODE
    this.disposables.push(
      this.displayService.onChange((e) => {
        if (e.value !== Scope.ROTOR) {
          this.store.dispatch(setValue(Constant.DATA_MODE));
        }
      }),
    );
  }
}

export default rotorNavigationSlice.reducer;
