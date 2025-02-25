import type { DisplayService } from '@service/display';
import type { LlmSettings } from '@type/settings';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class ChatService {
  private readonly display: DisplayService;

  private settings: LlmSettings;

  public constructor(display: DisplayService) {
    this.display = display;

    this.settings = {
      expertiseLevel: 'basic',
      customInstruction: '',
      OPEN_AI: {
        enabled: false,
        apiKey: '',
        name: 'Open AI',
      },
      GEMINI: {
        enabled: false,
        apiKey: '',
        name: 'Gemini',
      },
      CLAUDE: {
        enabled: false,
        apiKey: '',
        name: 'Claude',
      },
    };
  }

  public loadSettings(): LlmSettings {
    return this.settings;
  }

  public saveSettings(settings: LlmSettings): void {
    this.settings = settings;
  }

  public toggle(oldState: boolean): boolean {
    this.display.toggleFocus('CHAT');

    const newState = !oldState;
    if (newState) {
      hotkeys.setScope(Scope.CHAT);
    }

    return newState;
  }
}
