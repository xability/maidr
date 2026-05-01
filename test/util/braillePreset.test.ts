import type { GeneralSettings } from '@type/settings';
import { describe, expect, test } from '@jest/globals';
import {
  DEFAULT_SETTINGS,
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
  MULTI_LINE_BRAILLE_PRESETS,
  SINGLE_LINE_BRAILLE_PRESETS,
} from '@type/settings';
import {
  clampBrailleLines,
  clampBrailleSize,
  findBraillePreset,
  isBrailleDisplayKind,
  normalizeBrailleDisplay,
  selectBrailleDisplayKind,
  selectBraillePreset,
} from '@util/braillePreset';

describe('isBrailleDisplayKind', () => {
  test('accepts the three valid values', () => {
    expect(isBrailleDisplayKind('single')).toBe(true);
    expect(isBrailleDisplayKind('multi')).toBe(true);
    expect(isBrailleDisplayKind('manual')).toBe(true);
  });

  test('rejects everything else', () => {
    expect(isBrailleDisplayKind('')).toBe(false);
    expect(isBrailleDisplayKind('Single')).toBe(false);
    expect(isBrailleDisplayKind('other')).toBe(false);
    expect(isBrailleDisplayKind('null')).toBe(false);
  });
});

describe('clampBrailleLines', () => {
  test('clamps below the minimum to 1', () => {
    expect(clampBrailleLines(0)).toBe(1);
    expect(clampBrailleLines(-5)).toBe(1);
  });

  test('clamps above the maximum to MAX_BRAILLE_LINES', () => {
    expect(clampBrailleLines(MAX_BRAILLE_LINES + 1)).toBe(MAX_BRAILLE_LINES);
    expect(clampBrailleLines(9999)).toBe(MAX_BRAILLE_LINES);
  });

  test('floors fractional values', () => {
    expect(clampBrailleLines(3.7)).toBe(3);
  });

  test('coerces NaN to 1', () => {
    expect(clampBrailleLines(Number.NaN)).toBe(1);
  });
});

describe('clampBrailleSize', () => {
  test('clamps below the minimum to 1', () => {
    expect(clampBrailleSize(0)).toBe(1);
    expect(clampBrailleSize(-32)).toBe(1);
  });

  test('clamps above the maximum to MAX_BRAILLE_SIZE', () => {
    expect(clampBrailleSize(MAX_BRAILLE_SIZE + 1)).toBe(MAX_BRAILLE_SIZE);
    expect(clampBrailleSize(100000)).toBe(MAX_BRAILLE_SIZE);
  });

  test('floors fractional values', () => {
    expect(clampBrailleSize(40.9)).toBe(40);
  });

  test('coerces NaN to 1', () => {
    expect(clampBrailleSize(Number.NaN)).toBe(1);
  });
});

describe('findBraillePreset', () => {
  test('returns undefined for null id', () => {
    expect(findBraillePreset(SINGLE_LINE_BRAILLE_PRESETS, null)).toBeUndefined();
  });

  test('returns undefined for unknown id', () => {
    expect(findBraillePreset(SINGLE_LINE_BRAILLE_PRESETS, 'no-such-id')).toBeUndefined();
  });

  test('returns the matching preset by id', () => {
    const preset = findBraillePreset(SINGLE_LINE_BRAILLE_PRESETS, 'mantis-q40');
    expect(preset?.label).toBe('Mantis Q40');
    expect(preset?.cells).toBe(40);
    expect(preset?.lines).toBe(1);
  });
});

describe('selectBrailleDisplayKind', () => {
  test('falls back to first single-line preset when current id is null', () => {
    const slice = selectBrailleDisplayKind('single', null);
    if (slice.brailleDisplayKind === 'manual') {
      throw new Error('expected non-manual slice');
    }
    expect(slice.brailleDisplayKind).toBe('single');
    expect(slice.brailleDisplayPresetId).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].id);
    expect(slice.brailleDisplaySize).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].cells);
    expect(slice.brailleDisplayLines).toBe(1);
  });

  test('keeps current single-line preset when it still belongs to the kind', () => {
    const slice = selectBrailleDisplayKind('single', 'qbraille-xl');
    if (slice.brailleDisplayKind === 'manual') {
      throw new Error('expected non-manual slice');
    }
    expect(slice.brailleDisplayPresetId).toBe('qbraille-xl');
    expect(slice.brailleDisplaySize).toBe(40);
    expect(slice.brailleDisplayLines).toBe(1);
  });

  test('falls back to first multi-line preset when switching from single', () => {
    // current id belongs to single-line list, so multi-line lookup misses
    const slice = selectBrailleDisplayKind('multi', 'qbraille-xl');
    if (slice.brailleDisplayKind === 'manual') {
      throw new Error('expected non-manual slice');
    }
    expect(slice.brailleDisplayKind).toBe('multi');
    expect(slice.brailleDisplayPresetId).toBe(MULTI_LINE_BRAILLE_PRESETS[0].id);
    expect(slice.brailleDisplaySize).toBe(MULTI_LINE_BRAILLE_PRESETS[0].cells);
    expect(slice.brailleDisplayLines).toBe(MULTI_LINE_BRAILLE_PRESETS[0].lines);
  });

  test('clears preset id and leaves cells/lines unset on switch to manual', () => {
    const slice = selectBrailleDisplayKind('manual', 'qbraille-xl');
    expect(slice.brailleDisplayKind).toBe('manual');
    expect(slice.brailleDisplayPresetId).toBeNull();
    // Manual variant does not declare size/lines on the slice; spreading
    // it over prior state preserves the existing values (see next test).
    expect((slice as Record<string, unknown>).brailleDisplaySize).toBeUndefined();
    expect((slice as Record<string, unknown>).brailleDisplayLines).toBeUndefined();
  });

  test('spreading manual slice over prior state preserves cells/lines', () => {
    const prev = {
      brailleDisplaySize: 40,
      brailleDisplayLines: 3,
      brailleDisplayPresetId: 'orbit-slate-340',
      brailleDisplayKind: 'multi' as const,
    };
    const slice = selectBrailleDisplayKind('manual', prev.brailleDisplayPresetId);
    const next = { ...prev, ...slice };
    expect(next.brailleDisplayKind).toBe('manual');
    expect(next.brailleDisplayPresetId).toBeNull();
    expect(next.brailleDisplaySize).toBe(40);
    expect(next.brailleDisplayLines).toBe(3);
  });
});

describe('selectBraillePreset', () => {
  test('returns null for an unknown single-line preset id', () => {
    expect(selectBraillePreset('single', 'no-such-id')).toBeNull();
  });

  test('returns null for an unknown multi-line preset id', () => {
    expect(selectBraillePreset('multi', 'no-such-id')).toBeNull();
  });

  test('returns single-line preset cells and lines', () => {
    const slice = selectBraillePreset('single', 'focus-14-blue-5g');
    if (!slice || slice.brailleDisplayKind === 'manual') {
      throw new Error('expected non-manual slice');
    }
    expect(slice.brailleDisplayKind).toBe('single');
    expect(slice.brailleDisplayPresetId).toBe('focus-14-blue-5g');
    expect(slice.brailleDisplaySize).toBe(14);
    expect(slice.brailleDisplayLines).toBe(1);
  });

  test('returns multi-line preset cells and lines', () => {
    const slice = selectBraillePreset('multi', 'monarch');
    if (!slice || slice.brailleDisplayKind === 'manual') {
      throw new Error('expected non-manual slice');
    }
    expect(slice.brailleDisplayKind).toBe('multi');
    expect(slice.brailleDisplayPresetId).toBe('monarch');
    expect(slice.brailleDisplaySize).toBe(32);
    expect(slice.brailleDisplayLines).toBe(10);
  });

  test('rejects a multi-line id when looking up under single', () => {
    expect(selectBraillePreset('single', 'monarch')).toBeNull();
  });
});

describe('preset catalog invariants', () => {
  test('every single-line preset has lines = 1', () => {
    for (const preset of SINGLE_LINE_BRAILLE_PRESETS) {
      expect(preset.lines).toBe(1);
    }
  });

  test('every multi-line preset has lines > 1', () => {
    for (const preset of MULTI_LINE_BRAILLE_PRESETS) {
      expect(preset.lines).toBeGreaterThan(1);
    }
  });

  test('every preset has cells within [1, MAX_BRAILLE_SIZE]', () => {
    const all = [...SINGLE_LINE_BRAILLE_PRESETS, ...MULTI_LINE_BRAILLE_PRESETS];
    for (const preset of all) {
      expect(preset.cells).toBeGreaterThanOrEqual(1);
      expect(preset.cells).toBeLessThanOrEqual(MAX_BRAILLE_SIZE);
    }
  });

  test('every preset has lines within [1, MAX_BRAILLE_LINES]', () => {
    const all = [...SINGLE_LINE_BRAILLE_PRESETS, ...MULTI_LINE_BRAILLE_PRESETS];
    for (const preset of all) {
      expect(preset.lines).toBeGreaterThanOrEqual(1);
      expect(preset.lines).toBeLessThanOrEqual(MAX_BRAILLE_LINES);
    }
  });

  test('all preset ids are unique across both lists', () => {
    const ids = [
      ...SINGLE_LINE_BRAILLE_PRESETS.map(p => p.id),
      ...MULTI_LINE_BRAILLE_PRESETS.map(p => p.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('normalizeBrailleDisplay', () => {
  const baseGeneral = DEFAULT_SETTINGS.general;

  test('returns the same object when manual kind has no preset id', () => {
    const general: GeneralSettings = { ...baseGeneral, brailleDisplayKind: 'manual', brailleDisplayPresetId: null };
    expect(normalizeBrailleDisplay(general)).toBe(general);
  });

  test('returns the same object when single-kind preset id is valid', () => {
    const general: GeneralSettings = {
      ...baseGeneral,
      brailleDisplayKind: 'single',
      brailleDisplayPresetId: 'mantis-q40',
      brailleDisplaySize: 40,
      brailleDisplayLines: 1,
    };
    expect(normalizeBrailleDisplay(general)).toBe(general);
  });

  test('snaps to first single-line preset when id is null', () => {
    const general: GeneralSettings = {
      ...baseGeneral,
      brailleDisplayKind: 'single',
      brailleDisplayPresetId: null,
    };
    const next = normalizeBrailleDisplay(general);
    expect(next.brailleDisplayPresetId).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].id);
    expect(next.brailleDisplaySize).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].cells);
    expect(next.brailleDisplayLines).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].lines);
  });

  test('snaps to first multi-line preset when id refers to a removed device', () => {
    const general: GeneralSettings = {
      ...baseGeneral,
      brailleDisplayKind: 'multi',
      brailleDisplayPresetId: 'no-such-device',
    };
    const next = normalizeBrailleDisplay(general);
    expect(next.brailleDisplayPresetId).toBe(MULTI_LINE_BRAILLE_PRESETS[0].id);
    expect(next.brailleDisplaySize).toBe(MULTI_LINE_BRAILLE_PRESETS[0].cells);
    expect(next.brailleDisplayLines).toBe(MULTI_LINE_BRAILLE_PRESETS[0].lines);
  });

  test('falls back to manual when kind is missing from older saved settings', () => {
    // Simulate a saved object that predates the kind field.
    const general = { ...baseGeneral, brailleDisplayKind: undefined } as unknown as GeneralSettings;
    const next = normalizeBrailleDisplay(general);
    expect(next.brailleDisplayKind).toBe('manual');
    expect(next.brailleDisplayPresetId).toBeNull();
  });
});
