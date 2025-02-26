import type { DisplayService } from '@service/display';
import type { Llm } from '@type/llm';
import type { Maidr } from '@type/maidr';
import type { LlmSettings } from '@type/settings';
import { Scope } from '@type/keys';
import hotkeys from 'hotkeys-js';

export class ChatService {
  private readonly display: DisplayService;
  private readonly json: Maidr;

  private settings: LlmSettings;
  private readonly models: Record<Llm, LlmModel>;

  public constructor(display: DisplayService, maidr: Maidr) {
    this.display = display;
    this.json = maidr;

    this.settings = {
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
    };

    this.models = {
      CHAT_GPT: new ChatGpt(),
      CLAUDE: new Claude(),
      GEMINI: new Gemini(),
    };
  }

  public sendMessage(): void {}

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
    } else {
      hotkeys.setScope(Scope.DEFAULT);
    }

    return newState;
  }
}

interface LlmModel {
  endPoint: string;
}

class ChatGpt implements LlmModel {
  public endPoint: string;

  public constructor() {
    this.endPoint = 'https://api.openai.com/v1/chat/completions';
  }
}

class Claude implements LlmModel {
  public endPoint: string;

  public constructor() {
    this.endPoint = '';
  }
}

class Gemini implements LlmModel {
  public endPoint: string;

  public constructor() {
    this.endPoint = '';
  }
}
