/**
 * A tactile graphics display MAIDR can drive.
 *
 * Distinct from the braille-display presets in {@link ./braillePreset}, which
 * describe a refreshable *text* display — how many cells of braille MAIDR
 * should encode a series into. A tactile graphics display has a pin *area* that
 * a chart is drawn onto, and MAIDR talks to it over Bluetooth rather than
 * leaving it to the screen reader.
 *
 * The same physical device can be both. The Dot Pad appears in each catalog for
 * that reason, describing a different half of itself each time.
 */
export interface TactileDisplayPreset {
  id: string;
  label: string;
  manufacturer: string;
}

/**
 * Tactile graphics displays offered in Settings.
 *
 * The pin geometry is deliberately absent: every device reports its own cell
 * rows, columns and text-line width once connected, and a hardcoded guess that
 * disagrees with the hardware draws a torn picture rather than failing loudly.
 */
export const TACTILE_DISPLAY_PRESETS: readonly TactileDisplayPreset[] = [
  { id: 'dot-pad-x', label: 'Dot Pad X', manufacturer: 'Dot Inc.' },
] as const;

/**
 * Formats a preset for the Settings device picker.
 * @param preset - The preset to describe
 */
export function formatTactilePreset(preset: TactileDisplayPreset): string {
  return `${preset.label} — ${preset.manufacturer}`;
}

/**
 * Reports whether an id names a device MAIDR knows how to drive.
 * @param id - The stored device id, or null when none is selected
 */
export function isTactileDisplayId(id: string | null): boolean {
  return id !== null && TACTILE_DISPLAY_PRESETS.some(preset => preset.id === id);
}
