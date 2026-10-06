import type { DotPadTransport } from '@type/dotPad';

/**
 * A tactile graphics display MAIDR can drive.
 *
 * Distinct from the braille-display presets in {@link ./braillePreset}, which
 * describe a refreshable *text* display — how many cells of braille MAIDR
 * should encode a series into. A tactile graphics display has a pin *area* that
 * a chart is drawn onto, and MAIDR talks to it directly rather than leaving it
 * to the screen reader.
 *
 * The same physical device can be both. The Dot Pad and the Monarch appear in
 * each catalog for that reason, describing a different half of themselves each
 * time.
 */
export interface TactileDisplayPreset {
  id: string;
  label: string;
  manufacturer: string;

  /**
   * The ways MAIDR reaches the device, in the order Settings offers them. The
   * first is the one tried as soon as the reader picks the device.
   */
  transports: readonly DotPadTransport[];
}

/**
 * Tactile graphics displays offered in Settings.
 *
 * The pin geometry is deliberately absent: every device reports its own cell
 * rows, columns and text-line width once connected, and a hardcoded guess that
 * disagrees with the hardware draws a torn picture rather than failing loudly.
 */
export const TACTILE_DISPLAY_PRESETS: readonly TactileDisplayPreset[] = [
  { id: 'dot-pad-x', label: 'Dot Pad X', manufacturer: 'Dot Inc.', transports: ['bluetooth', 'serial'] },
  { id: 'monarch', label: 'Monarch', manufacturer: 'APH / HumanWare', transports: ['hid'] },
] as const;

/**
 * The transports offered before the reader has picked a device: a DotPad's,
 * as they were when the DotPad was the only display.
 */
export const DEFAULT_TACTILE_TRANSPORTS: readonly DotPadTransport[] = ['bluetooth', 'serial'];

/**
 * Formats a preset for the Settings device picker.
 * @param preset - The preset to describe
 */
export function formatTactilePreset(preset: TactileDisplayPreset): string {
  return `${preset.label} — ${preset.manufacturer}`;
}

/**
 * Finds the preset a stored device id names.
 * @param id - The stored device id, or null when none is selected
 * @returns The preset, or undefined when the id names no device MAIDR drives
 */
export function tactilePresetFor(id: string | null): TactileDisplayPreset | undefined {
  return id === null ? undefined : TACTILE_DISPLAY_PRESETS.find(preset => preset.id === id);
}

/**
 * Reports whether an id names a device MAIDR knows how to drive.
 * @param id - The stored device id, or null when none is selected
 */
export function isTactileDisplayId(id: string | null): boolean {
  return tactilePresetFor(id) !== undefined;
}
