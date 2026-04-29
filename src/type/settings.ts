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
 * Upper bound on the configured number of cells per braille row. The largest
 * commercial single-line displays we recognize hold 80 cells; 160 leaves
 * generous headroom for unrecognized hardware while still rejecting
 * obviously bogus values typed into the manual input.
 */
export const MAX_BRAILLE_SIZE = 160;

/**
 * Clamps an arbitrary numeric value to a valid braille display line count.
 * Empty / NaN / negative inputs collapse to 1 so the stored value never
 * leaves the supported range, even mid-keystroke.
 * @param value - Raw numeric value from the input field.
 * @returns Clamped integer between 1 and MAX_BRAILLE_LINES.
 */
export function clampBrailleLines(value: number): number {
  return Math.min(MAX_BRAILLE_LINES, Math.max(1, Math.floor(value) || 1));
}

/**
 * Clamps an arbitrary numeric value to a valid braille display cell count.
 * Mirrors {@link clampBrailleLines} so the manual size input gets the same
 * defensive treatment as the lines input.
 * @param value - Raw numeric value from the input field.
 * @returns Clamped integer between 1 and MAX_BRAILLE_SIZE.
 */
export function clampBrailleSize(value: number): number {
  return Math.min(MAX_BRAILLE_SIZE, Math.max(1, Math.floor(value) || 1));
}

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
  manufacturer: string;
  cells: number;
  lines: number;
}

/**
 * Single-line braille display presets (lines = 1).
 */
export const SINGLE_LINE_BRAILLE_PRESETS: readonly BrailleDisplayPreset[] = [
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

/**
 * Multi-line braille display presets (lines > 1).
 */
export const MULTI_LINE_BRAILLE_PRESETS: readonly BrailleDisplayPreset[] = [
  { id: 'canute-360', label: 'Canute 360', manufacturer: 'Bristol Braille Technology', cells: 40, lines: 9 },
  { id: 'monarch', label: 'Monarch', manufacturer: 'APH / HumanWare / NFB', cells: 32, lines: 10 },
  { id: 'orbit-slate-340', label: 'Orbit Slate 340', manufacturer: 'Orbit Research', cells: 40, lines: 3 },
  { id: 'orbit-slate-520', label: 'Orbit Slate 520', manufacturer: 'Orbit Research', cells: 20, lines: 5 },
] as const;

/**
 * Partial settings slice produced by a braille preset / kind selection. The
 * UI merges this into the local form state so the relevant fields update
 * atomically.
 */
export interface BraillePresetSelection {
  brailleDisplayKind: BrailleDisplayKind;
  brailleDisplayPresetId: string | null;
  brailleDisplaySize?: number;
  brailleDisplayLines?: number;
}

/**
 * Looks up a preset by id, returning undefined when the id is null or no
 * matching preset exists. Exported so component handlers and tests share a
 * single resolution path.
 * @param presets - Preset list to search.
 * @param presetId - Preset id to find, or null.
 * @returns The matching preset, or undefined.
 */
export function findBraillePreset(
  presets: readonly BrailleDisplayPreset[],
  presetId: string | null,
): BrailleDisplayPreset | undefined {
  if (!presetId) {
    return undefined;
  }
  return presets.find(p => p.id === presetId);
}

/**
 * Computes the settings slice for switching the braille display kind. When
 * switching to single/multi we keep the user's previously selected preset
 * if it still belongs to that kind, otherwise we fall back to the first
 * preset in the list.
 *
 * Switching to manual intentionally omits `brailleDisplaySize` and
 * `brailleDisplayLines` from the returned slice, so when the caller spreads
 * the slice over previous state (`{ ...prev, ...slice }`) the existing
 * cells/lines numbers are preserved as the starting point for the user's
 * manual edits, rather than being reset to defaults or to the previous
 * preset's values.
 * @param kind - Target braille display kind.
 * @param currentPresetId - Currently selected preset id, if any.
 * @returns Settings slice to merge into form state.
 */
export function selectBrailleDisplayKind(
  kind: BrailleDisplayKind,
  currentPresetId: string | null,
): BraillePresetSelection {
  if (kind === 'single') {
    const preset = findBraillePreset(SINGLE_LINE_BRAILLE_PRESETS, currentPresetId)
      ?? SINGLE_LINE_BRAILLE_PRESETS[0];
    return {
      brailleDisplayKind: 'single',
      brailleDisplayPresetId: preset.id,
      brailleDisplaySize: preset.cells,
      brailleDisplayLines: preset.lines,
    };
  }
  if (kind === 'multi') {
    const preset = findBraillePreset(MULTI_LINE_BRAILLE_PRESETS, currentPresetId)
      ?? MULTI_LINE_BRAILLE_PRESETS[0];
    return {
      brailleDisplayKind: 'multi',
      brailleDisplayPresetId: preset.id,
      brailleDisplaySize: preset.cells,
      brailleDisplayLines: preset.lines,
    };
  }
  return {
    brailleDisplayKind: 'manual',
    brailleDisplayPresetId: null,
  };
}

/**
 * Computes the settings slice for selecting a specific preset within a
 * single- or multi-line list. Returns null when the preset id is unknown
 * for the given kind, allowing callers to skip the update.
 * @param kind - Preset kind, single or multi.
 * @param presetId - Id of the preset chosen by the user.
 * @returns Settings slice to merge, or null when the id is invalid.
 */
export function selectBraillePreset(
  kind: 'single' | 'multi',
  presetId: string,
): BraillePresetSelection | null {
  const presets = kind === 'single'
    ? SINGLE_LINE_BRAILLE_PRESETS
    : MULTI_LINE_BRAILLE_PRESETS;
  const preset = findBraillePreset(presets, presetId);
  if (!preset) {
    return null;
  }
  return {
    brailleDisplayKind: kind,
    brailleDisplayPresetId: preset.id,
    brailleDisplaySize: preset.cells,
    brailleDisplayLines: preset.lines,
  };
}

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
