import type { PayloadAction } from '@reduxjs/toolkit';
import type { RotorNavigationService } from '@service/rotor';
import type { AppStore } from '@state/store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

/**
 * What the visual rotor dial draws: the modes around its ring, the current
 * one, and how far the ring has turned.
 */
export interface RotorDialState {
  /** Mode names, in cycle order, around the ring. */
  labels: string[];
  /** Index of the current mode in {@link labels}. */
  index: number;
  /**
   * Steps the ring has turned in total, +1 per forward and -1 per backward
   * cycle. Always congruent to {@link index} modulo the number of labels, but
   * not wrapped, so the ring keeps turning the way the reader turned it
   * instead of spinning back the long way when the cycle wraps.
   */
  turn: number;
  /** Which way the last cycle turned the ring: +1 forward, -1 backward. */
  direction: 1 | -1;
  /** Bumped on every cycle, so the dial reappears even on the same mode. */
  revision: number;
}

/**
 * State interface for rotor navigation containing the current rotor value.
 */
export interface RotorState {
  rotor_value: string | null;
  dial: RotorDialState | null;
}
const initialState: RotorState = {
  rotor_value: '',
  dial: null,
};

interface TurnDialPayload {
  labels: string[];
  index: number;
  step: 1 | -1;
}

/**
 * Whether two lists of mode names are the same, so the ring the dial last
 * drew is the ring it is turning now.
 */
function sameLabels(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((label, i) => label === b[i]);
}
const rotorNavigationSlice = createSlice({
  name: 'rotorNavigation',
  initialState,
  reducers: {
    show(): RotorState {
      return {
        rotor_value: '',
        dial: null,
      };
    },
    turnDial(state, action: PayloadAction<TurnDialPayload>) {
      const { labels, index, step } = action.payload;
      const prev = state.dial;
      // Keep turning the ring from where it is when it is the same ring;
      // a new trace's modes start a fresh ring at the current mode.
      const turn = prev && sameLabels(prev.labels, labels) ? prev.turn + step : index;
      state.dial = {
        labels,
        index,
        turn,
        direction: step,
        revision: (prev?.revision ?? 0) + 1,
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
export const { setValue, turnDial, reset } = rotorNavigationSlice.actions;
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
  public override dispose(): void {
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
    this.turnDial(1);
  }

  /**
   * Moves to the previous navigation unit in the rotor.
   */
  public moveToPrevNavUnit(): void {
    const curr_mode = this.rotorService.moveToPrevRotorUnit();
    this.store.dispatch(setValue(`${curr_mode}`));
    this.turnDial(-1);
  }

  /**
   * Turns the visual rotor dial to the mode the rotor just moved to.
   * @param step - +1 for a forward cycle, -1 for a backward one
   */
  private turnDial(step: 1 | -1): void {
    const { labels, index } = this.rotorService.getModeLabels();
    this.store.dispatch(turnDial({ labels, index, step }));
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
