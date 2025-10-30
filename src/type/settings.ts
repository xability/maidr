import type { Llm, LlmVersion } from './llm';

export type AriaMode = 'assertive' | 'polite';

export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced' | 'custom';

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
