import { describe, expect, test } from '@jest/globals';
import {
  clampBrailleLines,
  clampBrailleSize,
  findBraillePreset,
  MAX_BRAILLE_LINES,
  MAX_BRAILLE_SIZE,
  MULTI_LINE_BRAILLE_PRESETS,
  selectBrailleDisplayKind,
  selectBraillePreset,
  SINGLE_LINE_BRAILLE_PRESETS,
} from '@type/settings';

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
    expect(slice.brailleDisplayKind).toBe('single');
    expect(slice.brailleDisplayPresetId).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].id);
    expect(slice.brailleDisplaySize).toBe(SINGLE_LINE_BRAILLE_PRESETS[0].cells);
    expect(slice.brailleDisplayLines).toBe(1);
  });

  test('keeps current single-line preset when it still belongs to the kind', () => {
    const slice = selectBrailleDisplayKind('single', 'qbraille-xl');
    expect(slice.brailleDisplayPresetId).toBe('qbraille-xl');
    expect(slice.brailleDisplaySize).toBe(40);
    expect(slice.brailleDisplayLines).toBe(1);
  });

  test('falls back to first multi-line preset when switching from single', () => {
    // current id belongs to single-line list, so multi-line lookup misses
    const slice = selectBrailleDisplayKind('multi', 'qbraille-xl');
    expect(slice.brailleDisplayKind).toBe('multi');
    expect(slice.brailleDisplayPresetId).toBe(MULTI_LINE_BRAILLE_PRESETS[0].id);
    expect(slice.brailleDisplaySize).toBe(MULTI_LINE_BRAILLE_PRESETS[0].cells);
    expect(slice.brailleDisplayLines).toBe(MULTI_LINE_BRAILLE_PRESETS[0].lines);
  });

  test('clears preset id and leaves cells/lines unset on switch to manual', () => {
    const slice = selectBrailleDisplayKind('manual', 'qbraille-xl');
    expect(slice.brailleDisplayKind).toBe('manual');
    expect(slice.brailleDisplayPresetId).toBeNull();
    expect(slice.brailleDisplaySize).toBeUndefined();
    expect(slice.brailleDisplayLines).toBeUndefined();
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
    expect(slice).not.toBeNull();
    expect(slice!.brailleDisplayKind).toBe('single');
    expect(slice!.brailleDisplayPresetId).toBe('focus-14-blue-5g');
    expect(slice!.brailleDisplaySize).toBe(14);
    expect(slice!.brailleDisplayLines).toBe(1);
  });

  test('returns multi-line preset cells and lines', () => {
    const slice = selectBraillePreset('multi', 'monarch');
    expect(slice).not.toBeNull();
    expect(slice!.brailleDisplayKind).toBe('multi');
    expect(slice!.brailleDisplayPresetId).toBe('monarch');
    expect(slice!.brailleDisplaySize).toBe(32);
    expect(slice!.brailleDisplayLines).toBe(10);
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

  test('all preset ids are unique across both lists', () => {
    const ids = [
      ...SINGLE_LINE_BRAILLE_PRESETS.map(p => p.id),
      ...MULTI_LINE_BRAILLE_PRESETS.map(p => p.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
