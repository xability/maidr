import type { AudioService } from '@service/audio';
import type { DisplayService } from '@service/display';
import type { Settings } from '@type/settings';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class SettingsService {
  private readonly display: DisplayService;
  private readonly audioService?: AudioService;

  private readonly defaultSettings: Settings;
  private currentSettings: Settings;

  public constructor(display: DisplayService, audioService?: AudioService) {
    this.display = display;
    this.audioService = audioService;

    this.defaultSettings = {
      general: {
        volume: 50,
        highlightColor: '#03c809',
        brailleDisplaySize: 32,
        minFrequency: 200,
        maxFrequency: 1000,
        autoplayDuration: 4000,
        audioTransitionTime: 15,
        ariaMode: 'assertive',
        sineWaveSmoothing: false,
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

  public loadSettings(): Settings {
    return this.currentSettings;
  }

  /**
   * Saves updated settings to local storage
   * @param newSettings - The settings to save
   */
  public saveSettings(newSettings: Settings): void {
    // Apply the settings to relevant services
    if (this.audioService) {
      // Apply all audio-related settings at once for better coordination
      this.audioService.updateSettings(newSettings.general);
    }

    this.currentSettings = newSettings;
  }

  public resetSettings(): void {
    this.currentSettings = this.defaultSettings;
  }

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
