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

// 160 = 2x the largest known single-line display (80 cells) — generous
// headroom for unrecognized hardware while still rejecting obviously bogus
// manual input.
export const MAX_BRAILLE_SIZE = 160;

export const BRAILLE_DISPLAY_KINDS = ['single', 'multi', 'manual'] as const;
export type BrailleDisplayKind = (typeof BRAILLE_DISPLAY_KINDS)[number];

// 'manual' preserves whatever cells/lines numbers an older saved settings
// object already has, so users upgrading from before the preset selector
// see the same effective configuration.
export const DEFAULT_BRAILLE_DISPLAY_KIND: BrailleDisplayKind = 'manual';

export interface BrailleDisplayPreset {
  id: string;
  label: string;
  manufacturer: string;
  cells: number;
  lines: number;
}

// Non-empty so `presets[0]` is BrailleDisplayPreset (not | undefined),
// which lets selectBrailleDisplayKind's fallback be type-safe.
export type NonEmptyBraillePresets = readonly [
  BrailleDisplayPreset,
  ...BrailleDisplayPreset[],
];

// To add a new device, append a row here (single-line) or in
// MULTI_LINE_BRAILLE_PRESETS below. Keep ids kebab-case and unique across
// both lists; the unit test in test/util/braillePreset.test.ts enforces this.
export const SINGLE_LINE_BRAILLE_PRESETS: NonEmptyBraillePresets = [
  { id: 'focus-14-blue-5g', label: 'Focus 14 Blue (5th Gen)', manufacturer: 'Freedom Scientific', cells: 14, lines: 1 },
  { id: 'focus-40-blue-5g', label: 'Focus 40 Blue (5th Gen)', manufacturer: 'Freedom Scientific', cells: 40, lines: 1 },
  { id: 'focus-80-blue-5g', label: 'Focus 80 Blue (5th Gen)', manufacturer: 'Freedom Scientific', cells: 80, lines: 1 },
  { id: 'brailliant-bi-20x', label: 'Brailliant BI 20X', manufacturer: 'HumanWare', cells: 20, lines: 1 },
  { id: 'brailliant-bi-40x', label: 'Brailliant BI 40X', manufacturer: 'HumanWare', cells: 40, lines: 1 },
  { id: 'brailliant-b-80', label: 'Brailliant B 80', manufacturer: 'HumanWare', cells: 80, lines: 1 },
  { id: 'brailliant-bi-32', label: 'Brailliant BI 32', manufacturer: 'HumanWare', cells: 32, lines: 1 },
  { id: 'mantis-q40', label: 'Mantis Q40', manufacturer: 'APH / HumanWare', cells: 40, lines: 1 },
  { id: 'chameleon-20', label: 'Chameleon 20', manufacturer: 'APH / HumanWare', cells: 20, lines: 1 },
  { id: 'orbit-reader-20', label: 'Orbit Reader 20', manufacturer: 'Orbit Research', cells: 20, lines: 1 },
  { id: 'orbit-reader-40', label: 'Orbit Reader 40', manufacturer: 'Orbit Research', cells: 40, lines: 1 },
  { id: 'qbraille-xl', label: 'QBraille XL', manufacturer: 'HIMS', cells: 40, lines: 1 },
  { id: 'varioultra-20', label: 'VarioUltra 20', manufacturer: 'VisioBraille', cells: 20, lines: 1 },
  { id: 'varioultra-40', label: 'VarioUltra 40', manufacturer: 'VisioBraille', cells: 40, lines: 1 },
  { id: 'active-braille', label: 'Active Braille', manufacturer: 'Help Tech', cells: 40, lines: 1 },
  { id: 'actilino', label: 'Actilino', manufacturer: 'Help Tech', cells: 16, lines: 1 },
  { id: 'alva-usb-640', label: 'ALVA USB 640', manufacturer: 'Optelec', cells: 40, lines: 1 },
  { id: 'alva-bc680', label: 'ALVA BC680', manufacturer: 'Optelec', cells: 80, lines: 1 },
  { id: 'brailleme', label: 'BrailleMe', manufacturer: 'Innovision', cells: 20, lines: 1 },
  { id: 'nls-ereader', label: 'NLS eReader', manufacturer: 'HumanWare / Zoomax', cells: 20, lines: 1 },
] as const;

export const MULTI_LINE_BRAILLE_PRESETS: NonEmptyBraillePresets = [
  { id: 'canute-360', label: 'Canute 360', manufacturer: 'Bristol Braille Technology', cells: 40, lines: 9 },
  { id: 'monarch', label: 'Monarch', manufacturer: 'APH / HumanWare / NFB', cells: 32, lines: 10 },
  { id: 'orbit-slate-340', label: 'Orbit Slate 340', manufacturer: 'Orbit Research', cells: 40, lines: 3 },
  { id: 'orbit-slate-520', label: 'Orbit Slate 520', manufacturer: 'Orbit Research', cells: 20, lines: 5 },
  { id: 'dot-pad-x', label: 'Dot Pad X', manufacturer: 'Dot Inc.', cells: 20, lines: 8 },
] as const;

// Discriminated union: the manual variant has no preset id and intentionally
// omits cells/lines so callers spreading the slice over previous state
// (`{ ...prev, ...slice }`) preserve the user's existing values; the preset
// variant always supplies cells/lines together with a non-null id.
export type BraillePresetSelection
  = | {
    brailleDisplayKind: 'single' | 'multi';
    brailleDisplayPresetId: string;
    brailleDisplaySize: number;
    brailleDisplayLines: number;
  }
  | {
    brailleDisplayKind: 'manual';
    brailleDisplayPresetId: null;
  };

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
