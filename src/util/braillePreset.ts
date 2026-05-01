import type {
  BrailleDisplayKind,
  BrailleDisplayPreset,
  BraillePresetSelection,
  GeneralSettings,
} from '@type/settings';
import {
  BRAILLE_DISPLAY_KINDS,
  DEFAULT_BRAILLE_DISPLAY_KIND,
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
  MULTI_LINE_BRAILLE_PRESETS,
  SINGLE_LINE_BRAILLE_PRESETS,
} from '@type/settings';

export function isBrailleDisplayKind(value: string): value is BrailleDisplayKind {
  return (BRAILLE_DISPLAY_KINDS as readonly string[]).includes(value);
}

export function clampBrailleLines(value: number): number {
  return Math.min(MAX_BRAILLE_LINES, Math.max(1, Math.floor(value) || 1));
}

export function clampBrailleSize(value: number): number {
  return Math.min(MAX_BRAILLE_SIZE, Math.max(1, Math.floor(value) || 1));
}

export function findBraillePreset(
  presets: readonly BrailleDisplayPreset[],
  presetId: string | null,
): BrailleDisplayPreset | undefined {
  if (!presetId) {
    return undefined;
  }
  return presets.find(p => p.id === presetId);
}

// Manual omits size/lines so spreading the slice preserves prior values.
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

// Repairs stale settings: an unknown / removed / undefined preset id under
// a single/multi kind, or a missing kind from a pre-feature saved object.
export function normalizeBrailleDisplay(general: GeneralSettings): GeneralSettings {
  const rawKind: unknown = general.brailleDisplayKind;
  const kind: BrailleDisplayKind = isBrailleDisplayKind(rawKind as string)
    ? (rawKind as BrailleDisplayKind)
    : DEFAULT_BRAILLE_DISPLAY_KIND;
  if (kind === 'manual') {
    return kind === general.brailleDisplayKind
      ? general
      : { ...general, brailleDisplayKind: 'manual', brailleDisplayPresetId: null };
  }
  const presets = kind === 'single'
    ? SINGLE_LINE_BRAILLE_PRESETS
    : MULTI_LINE_BRAILLE_PRESETS;
  if (findBraillePreset(presets, general.brailleDisplayPresetId)) {
    return general;
  }
  const slice = selectBrailleDisplayKind(kind, general.brailleDisplayPresetId);
  return { ...general, ...slice };
}
