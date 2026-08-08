import type { PointerGuidanceState } from '@type/state';
import { MathUtil } from '@util/math';

export interface PointerGuidanceBeep {
  frequency: number;
  pan: number;
  interval: number;
}

export interface PointerGuidanceConfig {
  maxDistancePx: number;
  minInterval: number;
  maxInterval: number;
  highFrequency: number;
  lowFrequency: number;
  panMagnitude: number;
}

export const DEFAULT_POINTER_GUIDANCE_CONFIG: PointerGuidanceConfig = {
  maxDistancePx: 160,
  minInterval: 0.08,
  maxInterval: 0.55,
  highFrequency: 1280,
  lowFrequency: 420,
  panMagnitude: 0.7,
};

/**
 * Returns null when no off-curve guidance beep should play (on-curve or
 * beyond `maxDistancePx`). `curveVertical: 'above'` follows screen-space
 * convention (y increases downward), so `above` is visually higher and
 * therefore maps to a higher pitch.
 */
export function resolvePointerGuidanceBeep(
  guidance: PointerGuidanceState | null,
  config: PointerGuidanceConfig = DEFAULT_POINTER_GUIDANCE_CONFIG,
): PointerGuidanceBeep | null {
  if (!guidance || guidance.onCurve || guidance.distancePx > config.maxDistancePx) {
    return null;
  }

  // The early-return above guarantees distancePx <= maxDistancePx, and
  // Math.hypot is non-negative, so the ratio is already in [0, 1] — no
  // clamp needed.
  const distanceNorm = guidance.distancePx / config.maxDistancePx;
  const interval = MathUtil.interpolate(distanceNorm, 0, 1, config.minInterval, config.maxInterval);

  return {
    frequency:
      guidance.curveVertical === 'above'
        ? config.highFrequency
        : config.lowFrequency,
    // Pan toward the curve. `'center'` (cursor exactly aligned with the
    // curve column) zeros the pan instead of falling through to a
    // direction the user can't perceive — this is the heatmap-center case
    // where falling through to 'left' would point audio away from the data.
    pan:
      guidance.curveHorizontal === 'center'
        ? 0
        : guidance.curveHorizontal === 'left'
          ? -config.panMagnitude
          : config.panMagnitude,
    interval,
  };
}
