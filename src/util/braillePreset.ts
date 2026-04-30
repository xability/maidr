import type {
  BrailleDisplayKind,
  BrailleDisplayPreset,
  BraillePresetSelection,
} from '@type/settings';
import {
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
  MULTI_LINE_BRAILLE_PRESETS,
  SINGLE_LINE_BRAILLE_PRESETS,
} from '@type/settings';

export function isBrailleDisplayKind(value: string): value is BrailleDisplayKind {
  return value === 'single' || value === 'multi' || value === 'manual';
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

// The 'manual' branch intentionally omits brailleDisplaySize and
// brailleDisplayLines so callers spreading the slice over previous state
// (`{ ...prev, ...slice }`) preserve the existing cells/lines numbers as
// the starting point for the user's manual edits.
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
