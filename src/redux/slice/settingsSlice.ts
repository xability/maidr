import type { ThunkContext } from '@redux/store';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Settings } from '@type/settings';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

interface SettingsState extends Settings {
  enabled: boolean;
}

const initialState: SettingsState = {
  enabled: false,
  general: {
    volume: 50,
    highlightColor: '#03c809',
    brailleDisplaySize: 32,
    minFrequency: 200,
    maxFrequency: 1000,
    autoplayDuration: 4000,
    ariaMode: 'assertive',
  },
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    update: (state, action: PayloadAction<Settings>) => {
      return { ...state, ...action.payload };
    },
    toggle: (state, action: PayloadAction<boolean>) => {
      state.enabled = action.payload;
    },
  },
});
const { toggle, update } = settingsSlice.actions;

export const toggleSettings = createAsyncThunk<void, void, ThunkContext>(
  'settings/toggle',
  (_, { getState, dispatch, extra }) => {
    const service = extra().settings;
    const currentState = getState().settings.enabled;
    const newState = service.toggle(currentState);
    dispatch(toggle(newState));
  },
);

export const loadSettings = createAsyncThunk<void, void, ThunkContext>(
  'settings/load',
  (_, { dispatch, extra }) => {
    const service = extra().settings;
    dispatch(update(service.loadSettings()));
  },
);

export const saveSettings = createAsyncThunk<void, Settings, ThunkContext>(
  'settings/save',
  (settings, { getState, dispatch, extra }) => {
    const service = extra().settings;
    dispatch(update(settings));
    service.saveSettings(getState().settings);
  },
);

export default settingsSlice.reducer;
