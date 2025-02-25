import type { ThunkContext } from '@redux/store';
import type { HelpMenuItem } from '@type/help';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface HelpMenuState {
  enabled: boolean;
  items: HelpMenuItem[];
}

const initialState: HelpMenuState = {
  enabled: false,
  items: [],
};

export const loadHelpMenu = createAsyncThunk<HelpMenuItem[], void, ThunkContext>(
  'help/load',
  (_, { extra }) => {
    return extra().help.getMenuItems();
  },
);

export const toggleHelpMenu = createAsyncThunk<boolean, void, ThunkContext>(
  'help/toggle',
  (_, { getState, extra }) => {
    const currentState = getState().helpMenu.enabled;
    return extra().help.toggle(currentState);
  },
);

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadHelpMenu.fulfilled, (state, action) => {
        state.items = action.payload;
      })
      .addCase(toggleHelpMenu.fulfilled, (state, action) => {
        state.enabled = action.payload;
      });
  },
});

export default helpSlice.reducer;
