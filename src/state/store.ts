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

const reducers = {
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
};

/**
 * Creates a new Redux store instance with all application view model reducers.
 * Each MAIDR plot instance should have its own store for state isolation.
 */
// eslint-disable-next-line ts/explicit-function-return-type -- Return type is inferred to derive AppStore and RootState types
export function createMaidrStore() {
  return configureStore({ reducer: reducers });
}

/**
 * Type representing the application store instance.
 */
export type AppStore = ReturnType<typeof createMaidrStore>;

/**
 * Root state type derived from the store's reducer map.
 */
export type RootState = ReturnType<AppStore['getState']>;
