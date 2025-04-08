import { configureStore } from '@reduxjs/toolkit';
import { ServiceLocator } from '@service/locator';
import chatReducer from './slice/chatSlice';
import helpMenuReducer from './slice/helpSlice';
import notificationReducer from './slice/notificationSlice';
import settingsReducer from './slice/settingsSlice';
import textReducer from './slice/textSlice';

const locator = (): ServiceLocator => ServiceLocator.instance;

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    help: helpMenuReducer,
    notification: notificationReducer,
    text: textReducer,
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
