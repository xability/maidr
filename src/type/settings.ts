import type { Llm, LlmVersion } from './llm';

/**
 * Default number of characters rendered per braille row when no user setting
 * is configured. 32 matches the most common physical braille display width.
 */
export const DEFAULT_BRAILLE_SIZE = 32;

/**
 * Default number of physical braille rows. 1 means single-line mode, where
 * the braille output is a flat string without row reversal or space-padding.
 */
export const DEFAULT_BRAILLE_LINES = 1;

/**
 * Upper bound on the configured number of braille rows. Acts as a sanity cap
 * so that pathological settings cannot produce extremely large braille
 * strings at render time.
 */
export const MAX_BRAILLE_LINES = 20;

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
  reverbIntensity: number;
  /**
   * Synthetic-IR length in seconds. Drives both the reverb tail length and the
   * fade-out window. Larger = longer ring-out.
   */
  reverbDuration: number;
  /**
   * When true, per-tone volume scales with the reverb (z) amount: 50% of the
   * configured volume at z=min, 125% at z=max. Off by default.
   */
  zScaleVolume: boolean;
  highlightColor: string;
  highContrastMode: boolean;
  highContrastLevels: number;
  highContrastLightColor: string;
  highContrastDarkColor: string;
  brailleDisplaySize: number;
  brailleDisplayLines: number;
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

export const DEFAULT_SETTINGS: Settings = {
  general: {
    volume: 50,
    reverbIntensity: 100,
    reverbDuration: 2,
    zScaleVolume: false,
    highlightColor: '#03c809',
    highContrastMode: false,
    highContrastLevels: 2,
    highContrastLightColor: '#ffffff',
    highContrastDarkColor: '#000000',
    brailleDisplaySize: DEFAULT_BRAILLE_SIZE,
    brailleDisplayLines: DEFAULT_BRAILLE_LINES,
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
