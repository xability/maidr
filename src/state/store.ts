import { configureStore } from '@reduxjs/toolkit';
import brailleReducer from './viewModel/brailleViewModel';
import chatReducer from './viewModel/chatViewModel';
import displayReducer from './viewModel/displayViewModel';
import helpMenuReducer from './viewModel/helpViewModel';
import reviewReducer from './viewModel/reviewViewModel';
import settingsReducer from './viewModel/settingsViewModel';
import textReducer from './viewModel/textViewModel';

export const store = configureStore({
  reducer: {
    braille: brailleReducer,
    chat: chatReducer,
    display: displayReducer,
    help: helpMenuReducer,
    review: reviewReducer,
    settings: settingsReducer,
    text: textReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppStore = typeof store;
