import type { Llm, LlmVersionMap } from './llm';

export type AriaMode = 'assertive' | 'polite';

export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced';

export interface LlmModelSettings<T extends Llm = Llm> {
  name: string;
  apiKey: string;
  enabled: boolean;
  version: LlmVersionMap[T];
}

export interface LlmSettings {
  expertiseLevel: ExpertiseLevel;
  customExpertise?: string;
  customInstruction: string;
  models: { [K in Llm]: LlmModelSettings<K> };
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
        version: 'gpt-4o',
      },
      CLAUDE: {
        enabled: false,
        apiKey: '',
        name: 'Claude',
        version: 'claude-3-5-sonnet-latest',
      },
      GEMINI: {
        enabled: false,
        apiKey: '',
        name: 'Gemini',
        version: 'gemini-2.0-flash',
      },
    },
  },
};
