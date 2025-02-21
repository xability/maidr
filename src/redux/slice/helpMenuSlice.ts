import type { ThunkContext } from '@redux/store';
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
    toggleHelpMenuAction(state, action: PayloadAction<boolean>): void {
      state.enabled = action.payload;
    },
    loadHelpMenuAction(state, action: PayloadAction<HelpMenuItem[]>): void {
      state.items = action.payload;
    },
  },
});
const { toggleHelpMenuAction, loadHelpMenuAction } = helpMenuSlice.actions;

export const loadHelpMenu = createAsyncThunk<void, void, ThunkContext>(
  'helpMenu/load',
  (_, { dispatch, extra }) => {
    const help = extra().help;
    dispatch(loadHelpMenuAction(help.menuItems));
  },
);

export const toggleHelpMenu = createAsyncThunk<void, void, ThunkContext>(
  'helpMenu/toggle',
  (_, { getState, dispatch, extra }) => {
    const help = extra().help;
    const currentState = getState().helpMenu.enabled;
    const newState = help.toggle(currentState);
    dispatch(toggleHelpMenuAction(newState));
  },
);

export default helpMenuSlice.reducer;
