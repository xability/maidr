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
  llm: {
    expertiseLevel: 'basic',
    customInstruction: '',
    models: {
      CHAT_GPT: {
        enabled: false,
        apiKey: '',
        name: 'ChatGPT',
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
