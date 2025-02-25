import type { LLM } from '@type/llm';

export type AriaMode = 'assertive' | 'polite';

export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced';

interface AgentSettings {
  name: string;
  apiKey: string;
  enabled: boolean;
}

export type LlmSettings =
  | {
    [key in LLM]: AgentSettings;
  }
  & {
    expertiseLevel: ExpertiseLevel;
    customInstruction: string;
  };

export interface GeneralSettings {
  volume: number;
  highlightColor: string;
  brailleDisplaySize: number;
  minFrequency: number;
  maxFrequency: number;
  autoplayDuration: number;
  ariaMode: AriaMode;
}
