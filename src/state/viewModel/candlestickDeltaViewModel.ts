import type { CandlestickDeltaField } from '@model/candlestickDelta';
import type { PayloadAction } from '@reduxjs/toolkit';
import type {
  CandlestickDeltaReference,
  CandlestickDeltaService,
} from '@service/candlestickDelta';
import type { NotificationService } from '@service/notification';
import type { AppStore } from '@state/store';
import { CANDLESTICK_DELTA_FIELDS } from '@model/candlestickDelta';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

/**
 * State for the candlestick delta settings dialog (F7).
 */
export interface CandlestickDeltaState {
  visible: boolean;
  references: CandlestickDeltaReference[];
  fields: CandlestickDeltaField[];
  initialReferenceId: string;
  initialField: CandlestickDeltaField;
}

const initialState: CandlestickDeltaState = {
  visible: false,
  references: [],
  fields: [...CANDLESTICK_DELTA_FIELDS],
  initialReferenceId: '',
  initialField: 'close',
};

interface ShowPayload {
  references: CandlestickDeltaReference[];
  initialReferenceId: string;
  initialField: CandlestickDeltaField;
}

const candlestickDeltaSlice = createSlice({
  name: 'candlestickDelta',
  initialState,
  reducers: {
    show(_state, action: PayloadAction<ShowPayload>): CandlestickDeltaState {
      return {
        visible: true,
        references: action.payload.references,
        fields: [...CANDLESTICK_DELTA_FIELDS],
        initialReferenceId: action.payload.initialReferenceId,
        initialField: action.payload.initialField,
      };
    },
    hide(): CandlestickDeltaState {
      return initialState;
    },
  },
});

const { show, hide } = candlestickDeltaSlice.actions;

/**
 * ViewModel bridging the candlestick delta service and the F7 dialog UI.
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
   * Opens the settings dialog when the feature applies here, or closes it if
   * it is already open (ESC path). Announces why when unavailable.
   */
  public toggle(): void {
    if (this.state.visible) {
      this.cancel();
      return;
    }

    const references = this.deltaService.getReferences();
    if (!references) {
      this.notification.notify(
        'Reference comparison is only available on candlestick charts with a line layer.',
      );
      return;
    }

    const activeSelection = this.deltaService.activeSelection;
    const initialReferenceId
      = activeSelection && references.some(ref => ref.id === activeSelection.referenceId)
        ? activeSelection.referenceId
        : references[0].id;

    this.store.dispatch(
      show({
        references,
        initialReferenceId,
        initialField: activeSelection?.field ?? 'close',
      }),
    );
    this.deltaService.openSettings();
  }

  /**
   * Confirms the dialog: closes it and activates the virtual delta layer
   * with the chosen reference series and OHLC field.
   */
  public confirm(referenceId: string, field: CandlestickDeltaField): void {
    this.store.dispatch(hide());
    this.deltaService.closeSettings();
    this.deltaService.activate(referenceId, field);
  }

  /** Cancels the dialog without changing the active layer. */
  public cancel(): void {
    this.store.dispatch(hide());
    this.deltaService.closeSettings();
  }
}

export default candlestickDeltaSlice.reducer;
