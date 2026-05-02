import type {
  BrailleDisplayKind,
  BrailleDisplayPreset,
  BraillePresetSelection,
  GeneralSettings,
  NonEmptyBraillePresets,
} from '@type/settings';
import {
  BRAILLE_DISPLAY_KINDS,
  DEFAULT_BRAILLE_DISPLAY_KIND,
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
} from '@type/settings';

// To add a new device, append a row here or in MULTI_LINE_BRAILLE_PRESETS.
// Ids must be kebab-case and unique across both lists.
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
