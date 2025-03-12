import type { DisplayService } from '@service/display';
import type { Settings } from '@type/settings';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

/**
 * Service for managing application settings
 */
export class SettingsService {
  private readonly display: DisplayService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;

  /**
   * Creates a new settings service instance
   *
   * @param display - The display service for UI interactions
   */
  public constructor(display: DisplayService) {
    this.display = display;

    this.defaultSettings = {
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
    this.currentSettings = this.defaultSettings;
  }

  /**
   * Loads current application settings
   *
   * @returns The current settings object
   */
  public loadSettings(): Settings {
    return this.currentSettings;
  }

  /**
   * Saves new application settings
   *
   * @param newSettings - The new settings to save
   */
  public saveSettings(newSettings: Settings): void {
    this.currentSettings = newSettings;
  }

  /**
   * Resets settings to default values
   */
  public resetSettings(): void {
    this.currentSettings = this.defaultSettings;
  }

  /**
   * Toggles the settings UI visibility state
   *
   * @param oldState - Current visibility state
   * @returns New visibility state
   */
  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus('SETTINGS');

    const newState = !oldState;
    if (newState) {
      hotkeys.setScope(Scope.SETTINGS);
    } else {
      hotkeys.setScope(Scope.DEFAULT);
    }

    return newState;
  }
}
