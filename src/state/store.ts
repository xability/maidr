import { configureStore } from '@reduxjs/toolkit';
import brailleReducer from './viewModel/brailleViewModel';
import chatReducer from './viewModel/chatViewModel';
import commandPaletteReducer from './viewModel/commandPaletteViewModel';
import displayReducer from './viewModel/displayViewModel';
import goToExtremaReducer from './viewModel/goToExtremaViewModel';
import helpMenuReducer from './viewModel/helpViewModel';
import reviewReducer from './viewModel/reviewViewModel';
import rotorReducer from './viewModel/rotorNavigationViewModel';
import settingsReducer from './viewModel/settingsViewModel';
import textReducer from './viewModel/textViewModel';

export const store = configureStore({
  reducer: {
    braille: brailleReducer,
    chat: chatReducer,
    commandPalette: commandPaletteReducer,
    display: displayReducer,
    goToExtrema: goToExtremaReducer,
    help: helpMenuReducer,
    review: reviewReducer,
    settings: settingsReducer,
    text: textReducer,
    rotor: rotorReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppStore = typeof store;
