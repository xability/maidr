import type { ThunkContext } from '@redux/store';
import type { PayloadAction } from '@reduxjs/toolkit';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface SettingsState {
  enabled: boolean;
}

const initialState: SettingsState = {
  enabled: false,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    toggleSettingsAction(state, action: PayloadAction<boolean>): void {
      state.enabled = action.payload;
    },
  },
});
const { toggleSettingsAction } = settingsSlice.actions;

export const toggleSettings = createAsyncThunk<void, void, ThunkContext>(
  'settings/toggle',
  (_, { getState, dispatch, extra }) => {
    const settings = extra().settings;
    const currentState = getState().settings.enabled;
    const newState = settings.toggle(currentState);
    dispatch(toggleSettingsAction(newState));
  },
);

export default settingsSlice.reducer;
