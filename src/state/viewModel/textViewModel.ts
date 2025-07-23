import type { PayloadAction } from '@reduxjs/toolkit';
import type { AutoplayService } from '@service/autoplay';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { PlotState } from '@type/state';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

interface TextState {
  enabled: boolean;
  announce: boolean;
  value: string;
  message: string | null;
}

const initialState: TextState = {
  enabled: true,
  announce: true,
  value: '',
  message: null,
};

const textSlice = createSlice({
  name: 'text',
  initialState,
  reducers: {
    update(state, action: PayloadAction<string>): void {
      state.value = action.payload;
    },
    announceText(state, action: PayloadAction<boolean>): void {
      state.announce = action.payload;
    },
    toggle(state, action: PayloadAction<boolean>): void {
      state.enabled = action.payload;
    },
    notify(state, action: PayloadAction<string>): void {
      state.message = action.payload;
    },
    clearMessage(state): void {
      state.message = null;
    },
    reset(): TextState {
      return initialState;
    },
  },
});
const { update, announceText, toggle, notify, clearMessage, reset } = textSlice.actions;

export class TextViewModel extends AbstractViewModel<TextState> {
  private readonly textService: TextService;
  private isLayerSwitching: boolean = false;
  private layerSwitchPoint: { x: number | number[] | string; y: number | number[] | string } | null = null;
  private hasProcessedInitialUpdate: boolean = false;

  public constructor(
    store: AppStore,
    text: TextService,
    notification: NotificationService,
    autoplay: AutoplayService,
  ) {
    super(store);
    this.textService = text;
    this.registerListeners(notification, autoplay);
  }

  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  private registerListeners(notification: NotificationService, autoplay: AutoplayService): void {
    this.disposables.push(this.textService.onChange((e) => {
      this.update(e.value);

      // Check if this is a navigation update and we're in layer switching mode
      if (this.isLayerSwitching) {
        // Skip the first trace state update after layer switch (it's the same point)
        if (!this.hasProcessedInitialUpdate) {
          this.hasProcessedInitialUpdate = true;
          return;
        }

        // Get the current state from the text service to extract actual coordinate values
        const currentState = this.textService.getCurrentState();

        if (currentState && !currentState.empty
          && ((currentState.type === 'trace' && !currentState.empty)
            || (currentState.type === 'subplot' && !currentState.empty && !currentState.trace.empty))) {
          // Handle both SubplotState and TraceState
          let traceText;
          if (currentState.type === 'subplot' && !currentState.empty && !currentState.trace.empty) {
            traceText = currentState.trace.text;
          } else if (currentState.type === 'trace' && !currentState.empty) {
            traceText = (currentState as any).text;
          }

          if (traceText) {
            const currentPoint = {
              x: traceText.main?.value,
              y: traceText.cross?.value,
            };

            // Check if the current point is different from the layer switch point
            if (this.layerSwitchPoint
              && (currentPoint.x !== this.layerSwitchPoint.x || currentPoint.y !== this.layerSwitchPoint.y)) {
              // User has navigated to a different point - clear the layer switching flag
              this.isLayerSwitching = false;
              this.layerSwitchPoint = null;
              this.hasProcessedInitialUpdate = false;
              this.store.dispatch(clearMessage());
            }
          }
        }
      }
    }));

    this.disposables.push(notification.onChange((e) => {
      // Use the TextService to detect layer switching
      if (this.textService.isLayerSwitch()) {
        // Layer switch detected by the service
        this.isLayerSwitching = true;
        this.hasProcessedInitialUpdate = false;

        // Get the current state from the text service to extract coordinates
        const currentState = this.textService.getCurrentState();
        if (currentState && !currentState.empty && currentState.type === 'subplot' && !currentState.trace.empty) {
          // Store the current point for navigation detection
          this.layerSwitchPoint = {
            x: currentState.trace.text?.main?.value,
            y: currentState.trace.text?.cross?.value,
          };

          const coordinates = this.textService.getCoordinateText();
          if (coordinates) {
            const enhancedMessage = `${e.value} at ${coordinates}`;
            this.notify(enhancedMessage);
          } else {
            this.notify(e.value);
          }
        } else {
          this.notify(e.value);
        }
      } else {
        // Not a layer switch, just pass through the notification
        this.notify(e.value);
      }
    }));

    this.disposables.push(autoplay.onChange((e) => {
      switch (e.type) {
        case 'start':
          this.setAriaAnnouncement(false);
          break;

        case 'stop':
          this.setAriaAnnouncement(true);
          break;
      }
    }));
  }

  public clearLayerSwitchingFlag(): void {
    if (this.isLayerSwitching) {
      this.isLayerSwitching = false;
      this.store.dispatch(clearMessage());
    }
  }

  public get state(): TextState {
    return this.store.getState().text;
  }

  public toggle(): void {
    const enabled = this.textService.toggle();
    this.store.dispatch(toggle(enabled));
  }

  public update(text: string | PlotState): void {
    const formattedText = this.textService.format(text);
    this.store.dispatch(update(formattedText));

    // Only clear the message for normal navigation (not layer switches)
    if (!this.isLayerSwitching) {
      this.store.dispatch(clearMessage());
    }
    // If we are in layer switching mode, don't clear the message
    // This allows the enhanced layer switch announcement to persist
  }

  public notify(message: string): void {
    this.store.dispatch(notify(message));
  }

  private setAriaAnnouncement(enabled: boolean): void {
    this.store.dispatch(announceText(enabled));
  }
}

export default textSlice.reducer;
