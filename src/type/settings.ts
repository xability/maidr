import type { Llm, LlmVersion } from './llm';

export type AriaMode = 'assertive' | 'polite';

export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced' | 'custom';

export type HoverMode = 'off' | 'pointermove' | 'click';

export interface LlmModelSettings {
  name: string;
  apiKey: string;
  enabled: boolean;
  version: LlmVersion;
}

export interface LlmSettings {
  expertiseLevel: ExpertiseLevel;
  customExpertise?: string;
  customInstruction: string;
  models: Record<Llm, LlmModelSettings>;
}

export interface GeneralSettings {
  volume: number;
  highlightColor: string;
  brailleDisplaySize: number;
  minFrequency: number;
  maxFrequency: number;
  autoplayDuration: number;
  ariaMode: AriaMode;
  hoverMode: HoverMode;
}

export interface Settings {
  general: GeneralSettings;
  llm: LlmSettings;
}

export const DEFAULT_SETTINGS: Settings = {
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
        name: 'OpenAI',
        version: 'gpt-4o',
      },
      ANTHROPIC_CLAUDE: {
        enabled: false,
        apiKey: '',
        name: 'Anthropic Claude',
        version: 'claude-3-7-sonnet-latest',
      },
      GOOGLE_GEMINI: {
        enabled: false,
        apiKey: '',
        name: 'Google Gemini',
        version: 'gemini-2.0-flash',
      },
    },
  },
};
