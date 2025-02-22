import type { ThunkContext } from '@redux/store';
import type { PayloadAction } from '@reduxjs/toolkit';
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

const helpMenuSlice = createSlice({
  name: 'helpMenu',
  initialState,
  reducers: {
    toggle(state, action: PayloadAction<boolean>) {
      state.enabled = action.payload;
    },
    load(state, action: PayloadAction<HelpMenuItem[]>) {
      state.items = action.payload;
    },
  },
});
const { toggle, load } = helpMenuSlice.actions;

export const loadHelpMenu = createAsyncThunk<void, void, ThunkContext>(
  'helpMenu/load',
  (_, { dispatch, extra }) => {
    const service = extra().help;
    dispatch(load(service.getMenuItems()));
  },
);

export const toggleHelpMenu = createAsyncThunk<void, void, ThunkContext>(
  'helpMenu/toggle',
  (_, { getState, dispatch, extra }) => {
    const service = extra().help;
    const currentState = getState().helpMenu.enabled;
    const newState = service.toggle(currentState);
    dispatch(toggle(newState));
  },
);

export default helpMenuSlice.reducer;
