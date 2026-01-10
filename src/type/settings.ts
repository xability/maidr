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
  highContrastMode: boolean;
  highContrastLevels: number;
  highContrastLightColor: string;
  highContrastDarkColor: string;
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
