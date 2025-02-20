import { configureStore } from '@reduxjs/toolkit';
import { ServiceLocator } from '@service/locator';
import helpMenuReducer from './helpMenuSlice';

export const store = configureStore({
  reducer: {
    helpMenu: helpMenuReducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({
    thunk: {
      extraArgument: () => ServiceLocator.instance,
    },
  }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type ThunkExtra = () => ServiceLocator;
