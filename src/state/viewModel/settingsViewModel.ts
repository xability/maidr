import type { PayloadAction } from '@reduxjs/toolkit';
import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { DotPadState } from '@type/dotPad';
import type { Settings } from '@type/settings';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { dotPadSession } from '@service/dotPadSession';
import { DEFAULT_SETTINGS } from '@type/settings';
import { AbstractViewModel } from './viewModel';

/**
 * State interface for application settings, extending the base Settings type.
 */
export interface SettingsState extends Settings {}

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

/**
 * ViewModel for managing application settings and configuration.
 */
export class SettingsViewModel extends AbstractViewModel<SettingsState> {
  private readonly settingsService: SettingsService;

  /**
   * Creates a new SettingsViewModel instance and loads initial settings.
   * @param store - The Redux store for state management
   * @param settingsService - Service for handling settings persistence and logic
   */
  public constructor(store: AppStore, settingsService: SettingsService) {
    super(store);
    this.settingsService = settingsService;
    this.load();
  }

  /**
   * Disposes the view model and resets settings state.
   */
  public override dispose(): void {
    super.dispose();
    this.store.dispatch(reset());
  }

  /**
   * Gets the current settings state.
   * @returns The current SettingsState
   */
  public get state(): SettingsState {
    return this.store.getState().settings;
  }

  /**
   * Loads settings from storage and updates the state.
   */
  public load(): void {
    const settings = this.settingsService.loadSettings();
    this.store.dispatch(update(settings));
  }

  /**
   * Saves settings, updates state, and closes the settings modal.
   * @param settings - The settings to save
   */
  public saveAndClose(settings: Settings): void {
    this.settingsService.saveSettings(settings);
    this.store.dispatch(update(settings));
    this.toggle();
  }

  /**
   * Saves settings and updates the state without closing the modal.
   * @param settings - The settings to save
   */
  public saveSettings(settings: Settings): void {
    this.settingsService.saveSettings(settings);
    this.store.dispatch(update(settings));
  }

  /**
   * Resets settings to default values and updates the state.
   */
  public reset(): void {
    const settings = this.settingsService.resetSettings();
    this.store.dispatch(update(settings));
  }

  /**
   * Toggles the visibility of the settings modal.
   */
  public toggle(): void {
    this.settingsService.toggle();
  }

  /**
   * Current state of the connection to a tactile graphics display.
   */
  public get tactileDisplayState(): DotPadState {
    return dotPadSession.current;
  }

  /**
   * Subscribes to changes in the tactile display connection.
   *
   * Settings reads this view model directly rather than through a Redux
   * selector, so connection progress reaches the dialog through this
   * subscription instead of a store update the dialog would not re-render for.
   *
   * @param listener - Called with each new connection state
   * @returns A disposable that ends the subscription
   */
  public onTactileDisplayStateChange(listener: (state: DotPadState) => void): Disposable {
    return dotPadSession.onStateChange(listener);
  }

  /**
   * Opens the browser's Bluetooth picker and connects to a tactile display.
   *
   * Must be reached synchronously from the user's click: the browser only shows
   * the picker while a gesture is still in progress, and anything awaited first
   * spends that activation.
   *
   * @returns The connection state once the attempt settles
   */
  public async connectTactileDisplay(): Promise<DotPadState> {
    return dotPadSession.connect();
  }

  /**
   * Disconnects the tactile display.
   */
  public disconnectTactileDisplay(): void {
    dotPadSession.disconnect();
  }
}

export default settingsSlice.reducer;
