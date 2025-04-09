import type { PayloadAction } from '@reduxjs/toolkit';
import type { NotificationService } from '@service/notification';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

interface NotificationState {
  value: string;
}

const initialState: NotificationState = {
  value: '',
};

const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    update(state, action: PayloadAction<string>): void {
      state.value = action.payload;
    },
    reset(): NotificationState {
      return initialState;
    },
  },
});
const { update, reset } = notificationSlice.actions;

export class NotificationViewModel extends AbstractViewModel<NotificationState> {
  public constructor(store: AppStore, notification: NotificationService) {
    super(store);
    this.registerListeners(notification);
  }

  public dispose(): void {
    this.store.dispatch(reset());
    super.dispose();
  }

  private registerListeners(notification: NotificationService): void {
    this.disposables.push(notification.onChange((e) => {
      this.store.dispatch(update(e.value));
    }));
  }

  public get state(): NotificationState {
    return this.store.getState().notification;
  }
}

export default notificationSlice.reducer;
