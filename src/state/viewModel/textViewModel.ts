import type { PayloadAction } from '@reduxjs/toolkit';
import type { AutoplayService } from '@service/autoplay';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { PlotState } from '@type/state';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for text display and announcement functionality.
 */
interface TextState {
  enabled: boolean;
  announce: boolean;
  value: string;
  /**
   * Monotonic counter that increments on every update (including same-text updates).
   *  Used by the View to detect re-announcement requests without invisible characters.
   */
  revision: number;
  message: string | null;
}

const initialState: TextState = {
  enabled: true,
  announce: true,
  value: '',
  revision: 0,
  message: null,
};

const textSlice = createSlice({
  name: 'text',
  initialState,
  reducers: {
    update(state, action: PayloadAction<string>): void {
      state.value = action.payload;
      state.revision += 1;
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

/**
 * ViewModel for managing text display, announcements, and notifications.
 */
export class TextViewModel extends AbstractViewModel<TextState> {
  private readonly textService: TextService;

  /**
   * Creates a new TextViewModel instance and registers event listeners.
   * @param store - The Redux store for state management
   * @param text - Service for managing text formatting and updates
   * @param notification - Service for handling notification messages
   * @param autoplay - Service for managing autoplay functionality
   */
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

  /**
   * Disposes the view model and resets text state.
   */
  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  /**
   * Registers event listeners for text, notification, and autoplay services.
   * @param notification - The notification service to listen to
   * @param autoplay - The autoplay service to listen to
   */
  private registerListeners(notification: NotificationService, autoplay: AutoplayService): void {
    this.disposables.push(this.textService.onChange((e) => {
      this.update(e.value);
    }));

    this.disposables.push(this.textService.onNavigation((e) => {
      if (e.type === 'first_navigation') {
        this.setAnnounce(true);
      }
    }));

    this.disposables.push(notification.onChange((e) => {
      this.notify(e.value);
    }));

    this.disposables.push(autoplay.onChange((e) => {
      switch (e.type) {
        case 'start':
          this.setAnnounce(false);
          break;
        case 'stop':
          this.setAnnounce(true);
          break;
      }
    }));
  }

  /**
   * Gets the current text state.
   * @returns The current TextState
   */
  public get state(): TextState {
    return this.store.getState().text;
  }

  /**
   * Toggles the text display feature on or off.
   */
  public toggle(): void {
    const enabled = this.textService.toggle();
    this.store.dispatch(toggle(enabled));
  }

  /**
   * Updates the displayed text with formatted content.
   * Each dispatch increments a revision counter in the Redux state, so the View
   * always receives a new state — even when the text is identical. This allows
   * the View to force a screen-reader re-announcement by re-mounting the alert
   * element with a new React key, without relying on invisible Unicode characters.
   * @param text - The text or plot state to display
   */
  public update(text: string | PlotState): void {
    const formattedText = this.textService.format(text);
    this.store.dispatch(update(formattedText));
    this.store.dispatch(clearMessage());
  }

  /**
   * Displays a notification message to the user.
   * @param message - The message to display
   */
  public notify(message: string): void {
    this.store.dispatch(notify(message));
  }

  /**
   * Sets whether text should be announced by screen readers.
   * @param enabled - Whether to enable text announcements
   */
  public setAnnounce(enabled: boolean): void {
    this.store.dispatch(announceText(enabled));
  }
}

export default textSlice.reducer;
