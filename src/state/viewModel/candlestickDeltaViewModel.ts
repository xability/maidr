import type { PayloadAction } from '@reduxjs/toolkit';
import type {
  CandlestickDeltaReference,
  CandlestickDeltaService,
} from '@service/candlestickDelta';
import type { NotificationService } from '@service/notification';
import type { AppStore } from '@state/store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

/**
 * State for the candlestick delta reference picker (Ctrl+Shift+L): a listbox
 * of the moving-average / reference lines available in the current subplot.
 */
export interface CandlestickDeltaState {
  visible: boolean;
  references: CandlestickDeltaReference[];
  selectedIndex: number;
}

const initialState: CandlestickDeltaState = {
  visible: false,
  references: [],
  selectedIndex: 0,
};

interface ShowPayload {
  references: CandlestickDeltaReference[];
  selectedIndex: number;
}

const candlestickDeltaSlice = createSlice({
  name: 'candlestickDelta',
  initialState,
  reducers: {
    show(_state, action: PayloadAction<ShowPayload>): CandlestickDeltaState {
      return {
        visible: true,
        references: action.payload.references,
        selectedIndex: action.payload.selectedIndex,
      };
    },
    setSelectedIndex(
      state,
      action: PayloadAction<number>,
    ): CandlestickDeltaState {
      return { ...state, selectedIndex: action.payload };
    },
    hide(): CandlestickDeltaState {
      return initialState;
    },
  },
});

const { show, setSelectedIndex, hide } = candlestickDeltaSlice.actions;

/**
 * ViewModel bridging the candlestick delta service and the reference picker.
 * Owns the Ctrl+L toggle logic and the Ctrl+Shift+L reference listbox.
 */
export class CandlestickDeltaViewModel extends AbstractViewModel<CandlestickDeltaState> {
  private readonly deltaService: CandlestickDeltaService;
  private readonly notification: NotificationService;

  public constructor(
    store: AppStore,
    deltaService: CandlestickDeltaService,
    notification: NotificationService,
  ) {
    super(store);
    this.deltaService = deltaService;
    this.notification = notification;
  }

  public dispose(): void {
    super.dispose();
    this.store.dispatch(hide());
  }

  public get state(): CandlestickDeltaState {
    return this.store.getState().candlestickDelta;
  }

  /**
   * Ctrl+L: toggles the comparison layer on or off using the remembered
   * reference line. When no reference has been chosen yet, warns the user and
   * opens the reference picker so they can pick one.
   */
  public toggleLayer(): void {
    if (this.deltaService.isActive) {
      this.deltaService.deactivate();
      return;
    }

    if (this.deltaService.selectedReference !== null) {
      this.deltaService.activate();
      return;
    }

    // First use with nothing chosen: guide the user to the picker.
    if (!this.openReferencePicker()) {
      return;
    }
    this.notification.notify(
      'No reference line chosen yet. Use the list to pick a moving average '
      + 'line and press Enter to compare. Press Escape to cancel.',
    );
  }

  /**
   * Ctrl+Shift+L: opens the reference picker so the user can choose (or
   * change) the reference line. Returns false and announces why when the
   * feature does not apply in the current context.
   * @returns True when the picker was opened
   */
  public openReferencePicker(): boolean {
    if (this.state.visible) {
      this.cancel();
      return false;
    }

    const references = this.deltaService.getReferences();
    if (!references) {
      this.notification.notify(
        'Reference comparison is only available on candlestick charts with a line layer.',
      );
      return false;
    }

    const remembered = this.deltaService.selectedReference;
    const rememberedIndex = remembered
      ? references.findIndex(ref => ref.id === remembered)
      : -1;

    this.store.dispatch(
      show({
        references,
        selectedIndex: rememberedIndex >= 0 ? rememberedIndex : 0,
      }),
    );
    this.deltaService.openSettings();
    return true;
  }

  /** Moves the listbox selection up one option, clamped at the top. */
  public moveSelectionUp(): void {
    const nextIndex = Math.max(0, this.state.selectedIndex - 1);
    this.store.dispatch(setSelectedIndex(nextIndex));
  }

  /** Moves the listbox selection down one option, clamped at the bottom. */
  public moveSelectionDown(): void {
    const nextIndex = Math.min(
      this.state.references.length - 1,
      this.state.selectedIndex + 1,
    );
    this.store.dispatch(setSelectedIndex(nextIndex));
  }

  /** Sets the listbox selection directly (mouse click on an option). */
  public setSelectedIndex(index: number): void {
    if (index < 0 || index >= this.state.references.length) {
      return;
    }
    this.store.dispatch(setSelectedIndex(index));
  }

  /**
   * Confirms the highlighted reference line: remembers it and activates the
   * comparison. Reselecting while active reconfigures the layer in place.
   */
  public confirmSelection(): void {
    const { references, selectedIndex } = this.state;
    const reference = references[selectedIndex];
    if (!reference) {
      this.cancel();
      return;
    }
    this.store.dispatch(hide());
    this.deltaService.closeSettings();
    this.deltaService.setSelectedReference(reference.id);
    this.deltaService.activate(reference.id);
  }

  /** Closes the picker without changing the remembered reference. */
  public cancel(): void {
    if (!this.state.visible) {
      return;
    }
    this.store.dispatch(hide());
    this.deltaService.closeSettings();
  }
}

export default candlestickDeltaSlice.reducer;
