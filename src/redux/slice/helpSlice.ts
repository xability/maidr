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

export const toggleHelpMenu = createAsyncThunk<HelpMenuState, void, ThunkContext>(
  'help/toggle',
  (_, { getState, extra }) => {
    const help = extra().help;
    const currentState = getState().help.enabled;

    const items = help.getMenuItems();
    const enabled = help.toggle(currentState);

    return { enabled, items };
  },
);

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(toggleHelpMenu.fulfilled, (_, action) => {
        return action.payload;
      });
  },
});

export default helpSlice.reducer;
