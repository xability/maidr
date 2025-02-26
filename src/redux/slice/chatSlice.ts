import type { ThunkContext } from '@redux/store';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface ChatState {
  enabled: boolean;
}

const initialState: ChatState = {
  enabled: false,
};

export const toggleChat = createAsyncThunk<boolean, void, ThunkContext>(
  'chat/toggle',
  (_, { getState, extra }) => {
    const currentState = getState().chat.enabled;
    return extra().chat.toggle(currentState);
  },
);

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(toggleChat.fulfilled, (state, action) => {
        state.enabled = action.payload;
      });
  },
});

export default chatSlice.reducer;
