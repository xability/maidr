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
    reset(): RotorState {
      return initialState;
    },
  },
});
export const { setValue, reset } = rotorNavigationSlice.actions;
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
   * Disposes the view model and resets rotor state to its initial value.
   * Prevents a stale rotor value from surviving controller disposal and being
   * re-announced in the live region on the next focus-in.
   */
  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
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
   * Runs a rotor move and clears the rotor announcement area.
   *
   * Boundary / unavailable messages returned by the service have already been
   * announced through the notification service (the revision-keyed
   * `role="alert"` region, which re-announces on every repeat press) and are
   * shown visually in the text container. Writing them into `rotor_value` too
   * would push the identical text into a SECOND aria-live region
   * (`ROTOR_AREA`), so a screen reader announces the same boundary message
   * twice on the first hit (#630 item 3). `rotor_value` is therefore reserved
   * for the rotor mode name (set by the cycle methods); moves clear it, which
   * matches the pre-existing behaviour on a successful move.
   * @param move - The rotor service move to run; its return value is ignored
   *   here because announcement is handled inside the service.
   */
  private runMove(move: () => string | null): void {
    move();
    this.store.dispatch(setValue(null));
  }

  /**
   * Moves up within the current rotor navigation unit.
   */
  public moveUp(): void {
    this.runMove(() => this.rotorService.moveUp());
  }

  /**
   * Moves left within the current rotor navigation unit.
   */
  public moveLeft(): void {
    this.runMove(() => this.rotorService.moveLeft());
  }

  /**
   * Moves down within the current rotor navigation unit.
   */
  public moveDown(): void {
    this.runMove(() => this.rotorService.moveDown());
  }

  /**
   * Moves right within the current rotor navigation unit.
   */
  public moveRight(): void {
    this.runMove(() => this.rotorService.moveRight());
  }
}

export default rotorNavigationSlice.reducer;
