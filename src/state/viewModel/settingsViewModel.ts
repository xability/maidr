import type { PayloadAction } from '@reduxjs/toolkit';
import type { SettingsService } from '@service/settings';
import type { Settings } from '@type/settings';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

interface SettingsState extends Settings {}

const initialState: SettingsState = {
  general: {
    volume: 50,
    highlightColor: '#03c809',
    brailleDisplaySize: 32,
    minFrequency: 200,
    maxFrequency: 1000,
    autoplayDuration: 4000,
    ariaMode: 'assertive',
    hoverMode: 'pointermove',
  },
  llm: {
    expertiseLevel: 'basic',
    customInstruction: '',
    models: {
      OPENAI: {
        enabled: false,
        apiKey: '',
        name: 'OPENAI',
        version: 'gpt-4o',
      },
      ANTHROPIC_CLAUDE: {
        enabled: false,
        apiKey: '',
        name: 'ANTHROPIC_CLAUDE',
        version: 'claude-3-7-sonnet-latest',
      },
      GOOGLE_GEMINI: {
        enabled: false,
        apiKey: '',
        name: 'Gemini',
        version: 'gemini-2.0-flash',
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
    reset: (): SettingsState => {
      return initialState;
    },
  },
});
const { update, reset } = settingsSlice.actions;

export class SettingsViewModel extends AbstractViewModel<SettingsState> {
  private readonly settingsService: SettingsService;

  public constructor(store: AppStore, settingsService: SettingsService) {
    super(store);
    this.settingsService = settingsService;
    this.load();
  }

  public dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  public get state(): SettingsState {
    return this.store.getState().settings;
  }

  public load(): void {
    const settings = this.settingsService.loadSettings();
    this.store.dispatch(update(settings));
  }

  public saveAndClose(settings: Settings): void {
    this.settingsService.saveSettings(settings);
    this.store.dispatch(update(settings));
    this.toggle();
  }

  public saveSettings(settings: Settings): void {
    this.settingsService.saveSettings(settings);
    this.store.dispatch(update(settings));
  }

  public reset(): void {
    const settings = this.settingsService.resetSettings();
    this.store.dispatch(update(settings));
  }

  public toggle(): void {
    this.settingsService.toggle();
  }
}

export default settingsSlice.reducer;
