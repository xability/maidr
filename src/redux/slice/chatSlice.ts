import type { ThunkContext } from '@redux/store';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface ChatState {
  enabled: boolean;
}

const initialState: ChatState = {
  enabled: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    toggleChatAction(state, action: PayloadAction<boolean>): void {
      state.enabled = action.payload;
    },
  },
});
const { toggleChatAction } = chatSlice.actions;

export const toggleChat = createAsyncThunk<void, void, ThunkContext>(
  'chat/toggle',
  (_, { getState, dispatch, extra }) => {
    const help = extra().chat;
    const currentState = getState().chat.enabled;
    const newState = help.toggle(currentState);
    dispatch(toggleChatAction(newState));
  },
);

export default chatSlice.reducer;
