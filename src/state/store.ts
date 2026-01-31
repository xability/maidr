import { configureStore } from '@reduxjs/toolkit';
import brailleReducer from './viewModel/brailleViewModel';
import chatReducer from './viewModel/chatViewModel';
import commandPaletteReducer from './viewModel/commandPaletteViewModel';
import displayReducer from './viewModel/displayViewModel';
import goToExtremaReducer from './viewModel/goToExtremaViewModel';
import helpMenuReducer from './viewModel/helpViewModel';
import jumpToMarkReducer from './viewModel/jumpToMarkViewModel';
import reviewReducer from './viewModel/reviewViewModel';
import rotorReducer from './viewModel/rotorNavigationViewModel';
import settingsReducer from './viewModel/settingsViewModel';
import textReducer from './viewModel/textViewModel';

/**
 * Configures and creates the Redux store with all application view model reducers.
 */
export const store = configureStore({
  reducer: {
    braille: brailleReducer,
    chat: chatReducer,
    commandPalette: commandPaletteReducer,
    display: displayReducer,
    goToExtrema: goToExtremaReducer,
    help: helpMenuReducer,
    jumpToMark: jumpToMarkReducer,
    review: reviewReducer,
    settings: settingsReducer,
    text: textReducer,
    rotor: rotorReducer,
  },
});

/**
 * Root state type derived from the store's getState method.
 */
export type RootState = ReturnType<typeof store.getState>;

/**
 * Type representing the application store instance.
 */
export type AppStore = typeof store;
