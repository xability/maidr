import type { ThunkExtra } from '@redux/store';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

export interface HelpMenuItem {
  description: string;
  key: string;
}

interface HelpMenuState {
  enabled: boolean;
  items: HelpMenuItem[];
}

const initialState: HelpMenuState = {
  enabled: false,
  items: [],
};

const helpMenuSlice = createSlice({
  name: 'helpMenu',
  initialState,
  reducers: {
    toggleHelpMenu(state): void {
      state.enabled = !state.enabled;
    },
    loadHelpMenu(state, action: PayloadAction<HelpMenuItem[]>): void {
      state.items = action.payload;
    },
  },
});

export const closeHelpMenu = createAsyncThunk<void, void, { extra: ThunkExtra }>(
  'helpMenu/close',
  async (_, { extra }) => {
    const help = extra().help;
    help.toggle();
  },
);

export const { toggleHelpMenu, loadHelpMenu } = helpMenuSlice.actions;
export default helpMenuSlice.reducer;
