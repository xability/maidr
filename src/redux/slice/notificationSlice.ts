import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

interface NotificationState {
  value: string;
}

const initialState: NotificationState = {
  value: '',
};

const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    notify(state, action: PayloadAction<string>): void {
      state.value = action.payload;
    },
  },
});

export const { notify } = notificationSlice.actions;
export default notificationSlice.reducer;
