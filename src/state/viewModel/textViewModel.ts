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
      state.message = null;
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
    reset(): TextState {
      return initialState;
    },
  },
});
const { update, announceText, toggle, notify, reset } = textSlice.actions;

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
    this.store.dispatch(reset());
    super.dispose();
  }

  private registerListeners(notification: NotificationService, autoplay: AutoplayService): void {
    this.disposables.push(this.textService.onChange((e) => {
      this.update(e.value);
    }));

    this.disposables.push(notification.onChange((e) => {
      this.notify(e.value);
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
  }

  public notify(message: string): void {
    this.store.dispatch(notify(message));
  }

  private setAriaAnnouncement(enabled: boolean): void {
    this.store.dispatch(announceText(enabled));
  }
}

export default textSlice.reducer;
