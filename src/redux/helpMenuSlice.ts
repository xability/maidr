import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

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

export const { toggleHelpMenu, loadHelpMenu } = helpMenuSlice.actions;
export default helpMenuSlice.reducer;
