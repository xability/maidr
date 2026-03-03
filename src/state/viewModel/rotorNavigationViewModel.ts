import type { PayloadAction } from '@reduxjs/toolkit';
import type { RotorNavigationService } from '@service/rotor';
import type { AppStore } from '@state/store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

/**
 * State interface for rotor navigation containing the current rotor value.
 */
export interface RotorState {
  rotor_value: string | null;
}
const initialState: RotorState = {
  rotor_value: '',
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
/**
 * ViewModel for managing rotor-based navigation through plot elements.
 */
export class RotorNavigationViewModel extends AbstractViewModel<RotorState> {
  private readonly rotorService: RotorNavigationService;

  /**
   * Creates a new RotorNavigationViewModel instance.
   * @param store - The Redux store for state management
   * @param rotorService - Service for handling rotor navigation logic
   */
  public constructor(
    store: AppStore,
    rotorService: RotorNavigationService,
  ) {
    super(store);
    this.rotorService = rotorService;
  }

  /**
   * Gets the current state of rotor navigation.
   * @returns The current RotorState
   */
  public get state(): RotorState {
    return this.store.getState().rotor;
  }

  /**
   * Moves to the next navigation unit in the rotor.
   */
  public moveToNextNavUnit(): void {
    const curr_mode = this.rotorService.moveToNextRotorUnit();
    this.store.dispatch(setValue(`${curr_mode}`));
  }

  /**
   * Moves to the previous navigation unit in the rotor.
   */
  public moveToPrevNavUnit(): void {
    const curr_mode = this.rotorService.moveToPrevRotorUnit();
    this.store.dispatch(setValue(`${curr_mode}`));
  }

  /**
   * Moves up within the current rotor navigation unit.
   */
  public moveUp(): void {
    this.store.dispatch(setValue(this.rotorService.moveUp()));
  }

  /**
   * Moves left within the current rotor navigation unit.
   */
  public moveLeft(): void {
    this.store.dispatch(setValue(this.rotorService.moveLeft()));
  }

  /**
   * Moves down within the current rotor navigation unit.
   */
  public moveDown(): void {
    this.store.dispatch(setValue(this.rotorService.moveDown()));
  }

  /**
   * Moves right within the current rotor navigation unit.
   */
  public moveRight(): void {
    this.store.dispatch(setValue(this.rotorService.moveRight()));
  }
}

export default rotorNavigationSlice.reducer;
