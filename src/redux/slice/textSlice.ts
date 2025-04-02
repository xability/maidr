import type { ThunkContext } from '@redux/store';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface TextState {
  enabled: boolean;
  announce: boolean;
  value: string;
}

const initialState: TextState = {
  enabled: true,
  announce: true,
  value: '',
};

export const toggleText = createAsyncThunk<boolean, void, ThunkContext>(
  'text/toggle',
  (_, { extra }) => {
    return extra().text.toggle();
  },
);

const textSlice = createSlice({
  name: 'text',
  initialState,
  reducers: {
    updateText(state, action: PayloadAction<string>): void {
      state.value = action.payload;
    },
    setTextAnnouncement(state, action: PayloadAction<boolean>): void {
      state.announce = action.payload;
    },
    resetText(): TextState {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(toggleText.fulfilled, (state, action) => {
        state.enabled = action.payload;
      });
  },
});

export const { updateText, setTextAnnouncement, resetText } = textSlice.actions;
export default textSlice.reducer;
