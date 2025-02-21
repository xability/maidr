import { configureStore } from '@reduxjs/toolkit';
import { ServiceLocator } from '@service/locator';
import chatReducer from './slice/chatSlice';
import helpMenuReducer from './slice/helpMenuSlice';
import settingsReducer from './slice/settingsSlice';

const locator = (): ServiceLocator => ServiceLocator.instance;

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    helpMenu: helpMenuReducer,
    settings: settingsReducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({
    thunk: {
      extraArgument: locator,
    },
  }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export interface ThunkContext {
  state: RootState;
  dispatch: AppDispatch;
  extra: typeof locator;
}
