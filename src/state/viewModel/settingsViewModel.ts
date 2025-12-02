import type { PayloadAction } from '@reduxjs/toolkit';
import type { SettingsService } from '@service/settings';
import type { Settings } from '@type/settings';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { DEFAULT_SETTINGS } from '@type/settings';
import { AbstractViewModel } from './viewModel';

interface SettingsState extends Settings {}

const initialState = DEFAULT_SETTINGS;

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
