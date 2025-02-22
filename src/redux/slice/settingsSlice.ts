import type { ThunkContext } from '@redux/store';
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

export const loadSettings = createAsyncThunk<Settings, void, ThunkContext>(
  'settings/load',
  async (_, { extra }) => {
    const service = extra().settings;
    return service.loadSettings();
  },
);

export const toggleSettings = createAsyncThunk<boolean, void, ThunkContext>(
  'settings/toggle',
  async (_, { getState, extra }) => {
    const service = extra().settings;
    const currentState = getState().settings.enabled;
    return service.toggle(currentState);
  },
);

export const saveSettings = createAsyncThunk<Settings, Settings, ThunkContext>(
  'settings/save',
  async (newSettings, { extra }) => {
    const service = extra().settings;
    service.saveSettings(newSettings);
    return newSettings;
  },
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.fulfilled, (state, action) => {
        return { ...state, ...action.payload };
      })
      .addCase(toggleSettings.fulfilled, (state, action) => {
        state.enabled = action.payload;
      })
      .addCase(saveSettings.fulfilled, (state, action) => {
        return { ...state, ...action.payload };
      });
  },
});

export default settingsSlice.reducer;
