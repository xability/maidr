import type { ThunkContext } from '@redux/store';
import type { Settings } from '@type/settings';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

/**
 * Extended settings state that includes UI state
 */
interface SettingsState extends Settings {
  /** Whether the settings UI is visible */
  enabled: boolean;
}

/**
 * Initial state for the settings slice
 */
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

/**
 * Thunk action to load application settings
 */
export const loadSettings = createAsyncThunk<Settings, void, ThunkContext>(
  'settings/load',
  (_, { extra }) => {
    return extra().settings.loadSettings();
  },
);

/**
 * Thunk action to toggle settings UI visibility
 */
export const toggleSettings = createAsyncThunk<boolean, void, ThunkContext>(
  'settings/toggle',
  (_, { getState, extra }) => {
    const currentState = getState().settings.enabled;
    return extra().settings.toggle(currentState);
  },
);

/**
 * Thunk action to save updated settings
 *
 * @param newSettings - The new settings to save
 */
export const saveSettings = createAsyncThunk<Settings, Settings, ThunkContext>(
  'settings/save',
  (newSettings, { dispatch, extra }) => {
    extra().settings.saveSettings(newSettings);
    dispatch(toggleSettings());
    return newSettings;
  },
);

/**
 * Thunk action to reset settings to defaults
 */
export const resetSettings = createAsyncThunk<Settings, void, ThunkContext>(
  'settings/reset',
  (_, { extra }) => {
    const service = extra().settings;
    service.resetSettings();
    return service.loadSettings();
  },
);

/**
 * Settings slice with reducer and action handlers
 */
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
