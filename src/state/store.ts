import { configureStore } from '@reduxjs/toolkit';
import chatReducer from './viewModel/chatViewModel';
import helpMenuReducer from './viewModel/helpViewModel';
import notificationReducer from './viewModel/notificationViewModel';
import settingsReducer from './viewModel/settingsViewModel';
import textReducer from './viewModel/textViewModel';

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    help: helpMenuReducer,
    notification: notificationReducer,
    settings: settingsReducer,
    text: textReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppStore = typeof store;
