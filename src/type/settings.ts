import type { Llm } from '@type/llm';

export type AriaMode = 'assertive' | 'polite';

export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced';

export interface LlmModelSettings {
  name: string;
  apiKey: string;
  enabled: boolean;
}

export interface LlmSettings {
  expertiseLevel: ExpertiseLevel;
  customExpertiseLevel?: string;
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
