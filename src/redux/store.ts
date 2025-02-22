import { configureStore } from '@reduxjs/toolkit';
import { ServiceLocator } from '@service/locator';
import helpMenuReducer from './slice/helpMenuSlice';

const locator = (): ServiceLocator => ServiceLocator.instance;

export const store = configureStore({
  reducer: {
    helpMenu: helpMenuReducer,
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
