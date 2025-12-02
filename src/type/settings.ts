import type { Llm, LlmVersion } from './llm';

/**
 * ARIA live region politeness level for screen reader announcements.
 */
export type AriaMode = 'assertive' | 'polite';

/**
 * User expertise level for tailoring AI chat responses.
 */
export type ExpertiseLevel = 'basic' | 'intermediate' | 'advanced' | 'custom';

/**
 * Mouse hover interaction mode for plot navigation.
 */
export type HoverMode = 'off' | 'pointermove' | 'click';

/**
 * Configuration settings for a specific LLM model.
 */
export interface LlmModelSettings {
  name: string;
  apiKey: string;
  enabled: boolean;
  version: LlmVersion;
}

/**
 * LLM-specific settings including expertise level and model configurations.
 */
export interface LlmSettings {
  expertiseLevel: ExpertiseLevel;
  customExpertise?: string;
  customInstruction: string;
  models: Record<Llm, LlmModelSettings>;
}

/**
 * General application settings for audio, visual, and accessibility features.
 */
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

/**
 * Root settings object containing all user preferences and configurations.
 */
export interface Settings {
  general: GeneralSettings;
  llm: LlmSettings;
}
