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
 * Configuration mode for the braille display. Determines whether the user
 * picks from a list of known displays or enters cells/lines manually.
 */
export type BrailleDisplayKind = 'single' | 'multi' | 'manual';

/**
 * Default braille display kind when no user setting is stored. 'manual'
 * preserves whatever cell/line numbers a previous version saved, so existing
 * users see the same effective configuration after upgrading.
 */
export const DEFAULT_BRAILLE_DISPLAY_KIND: BrailleDisplayKind = 'manual';

/**
 * A named, hard-coded braille display preset. The id is stable so that a
 * stored selection survives label edits in the future.
 */
export interface BrailleDisplayPreset {
  id: string;
  label: string;
  cells: number;
  lines: number;
}

/**
 * Single-line braille display presets (lines = 1).
 */
export const SINGLE_LINE_BRAILLE_PRESETS: readonly BrailleDisplayPreset[] = [
  { id: 'brailliant-bi-40x', label: 'Brailliant BI 40X', cells: 40, lines: 1 },
  { id: 'focus-40-blue', label: 'Focus 40 Blue', cells: 40, lines: 1 },
  { id: 'mantis-q40', label: 'Mantis Q40', cells: 40, lines: 1 },
  { id: 'orbit-reader-40', label: 'Orbit Reader 40', cells: 40, lines: 1 },
  { id: 'qbraille-xl', label: 'QBraille XL', cells: 40, lines: 1 },
  { id: 'brailliant-bi-20x', label: 'Brailliant BI 20X', cells: 20, lines: 1 },
  { id: 'focus-14', label: 'Focus 14', cells: 14, lines: 1 },
] as const;

/**
 * Multi-line braille display presets (lines > 1).
 */
export const MULTI_LINE_BRAILLE_PRESETS: readonly BrailleDisplayPreset[] = [
  { id: 'orbit-slate-520', label: 'Orbit Slate 520', cells: 20, lines: 5 },
  { id: 'orbit-slate-340', label: 'Orbit Slate 340', cells: 40, lines: 3 },
] as const;

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
  highContrastMode: boolean;
  highContrastLevels: number;
  highContrastLightColor: string;
  highContrastDarkColor: string;
  brailleDisplaySize: number;
  brailleDisplayLines: number;
  brailleDisplayKind: BrailleDisplayKind;
  brailleDisplayPresetId: string | null;
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
    highlightColor: '#03c809',
    highContrastMode: false,
    highContrastLevels: 2,
    highContrastLightColor: '#ffffff',
    highContrastDarkColor: '#000000',
    brailleDisplaySize: DEFAULT_BRAILLE_SIZE,
    brailleDisplayLines: DEFAULT_BRAILLE_LINES,
    brailleDisplayKind: DEFAULT_BRAILLE_DISPLAY_KIND,
    brailleDisplayPresetId: null,
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
