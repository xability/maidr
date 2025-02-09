import { configureStore } from '@reduxjs/toolkit';
import helpMenuReducer from './helpMenuSlice';

export const store = configureStore({
  reducer: {
    helpMenu: helpMenuReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
