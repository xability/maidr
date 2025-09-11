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
    this.store.dispatch(clearMessage());
  }

  public notify(message: string): void {
    this.store.dispatch(notify(message));
  }

  public setAnnounce(enabled: boolean): void {
    this.store.dispatch(announceText(enabled));
  }
}

export default textSlice.reducer;
