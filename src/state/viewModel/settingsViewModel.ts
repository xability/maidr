import type { PayloadAction } from '@reduxjs/toolkit';
import type { SettingsService } from '@service/settings';
import type { Settings } from '@type/settings';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

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

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    update: (state, action: PayloadAction<Settings>): SettingsState => {
      return { ...state, ...action.payload };
    },
    toggle: (state, action: PayloadAction<boolean>): void => {
      state.enabled = action.payload;
    },
    reset: (): SettingsState => {
      return initialState;
    },
  },
});
const { update, toggle, reset } = settingsSlice.actions;

export class SettingsViewModel extends AbstractViewModel<SettingsState> {
  private readonly settingsService: SettingsService;

  public constructor(store: AppStore, settingsService: SettingsService) {
    super(store);
    this.settingsService = settingsService;
  }

  public dispose(): void {
    this.store.dispatch(reset());
  }

  public get state(): SettingsState {
    return this.store.getState().settings;
  }

  public load(): void {
    const settings = this.settingsService.loadSettings();
    this.store.dispatch(update(settings));
  }

  public save(settings: Settings): void {
    this.settingsService.saveSettings(settings);
    this.store.dispatch(update(settings));
  }

  public toggle(): void {
    const current = this.state.enabled;
    const enabled = this.settingsService.toggle(current);
    this.store.dispatch(toggle(enabled));
  }

  public reset(): void {
    this.settingsService.resetSettings();
    const settings = this.settingsService.loadSettings();
    this.store.dispatch(update(settings));
  }
}

export default settingsSlice.reducer;
