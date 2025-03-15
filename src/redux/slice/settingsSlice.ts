import type { ThunkContext } from '@redux/store';
import type { Settings } from '@type/settings';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

/**
 * Interface defining general settings configuration
 */
interface GeneralSettings {
  volume: number;
  highlightColor: string;
  brailleDisplaySize: number;
  minFrequency: number;
  maxFrequency: number;
  autoplayDuration: number;
  audioTransitionTime: number;
  ariaMode: 'assertive' | 'polite';
}

interface SettingsState extends Settings {
  enabled: boolean;
}

const defaultGeneralSettings: GeneralSettings = {
  volume: 50,
  highlightColor: '#1976d2',
  brailleDisplaySize: 100,
  minFrequency: 200,
  maxFrequency: 1000,
  autoplayDuration: 1000,
  audioTransitionTime: 15,
  ariaMode: 'assertive',
};

const initialState: SettingsState = {
  enabled: false,
  general: defaultGeneralSettings,
  llm: {
    expertiseLevel: 'basic',
    customInstruction: '',
    models: {
      GPT: {
        enabled: false,
        apiKey: '',
        name: 'GPT',
      },
      CLAUDE: {
        enabled: false,
        apiKey: '',
        name: 'Claude',
      },
      GEMINI: {
        enabled: false,
        apiKey: '',
        name: 'Gemini',
      },
    },
  },
};

export const loadSettings = createAsyncThunk<Settings, void, ThunkContext>(
  'settings/load',
  (_, { extra }) => {
    return extra().settings.loadSettings();
  },
);

export const toggleSettings = createAsyncThunk<boolean, void, ThunkContext>(
  'settings/toggle',
  (_, { getState, extra }) => {
    const currentState = getState().settings.enabled;
    return extra().settings.toggle(currentState);
  },
);

export const saveSettings = createAsyncThunk<Settings, Settings, ThunkContext>(
  'settings/save',
  (newSettings, { dispatch, extra }) => {
    extra().settings.saveSettings(newSettings);
    dispatch(toggleSettings());
    return newSettings;
  },
);

export const resetSettings = createAsyncThunk<Settings, void, ThunkContext>(
  'settings/reset',
  (_, { extra }) => {
    const service = extra().settings;
    service.resetSettings();
    return service.loadSettings();
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
      })
      .addCase(resetSettings.fulfilled, (state, action) => {
        return { ...state, ...action.payload };
      });
  },
});

export default settingsSlice.reducer;
