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

  const distanceNorm = MathUtil.clamp(guidance.distancePx / config.maxDistancePx, 0, 1);
  const interval = MathUtil.interpolate(distanceNorm, 0, 1, config.minInterval, config.maxInterval);

  return {
    frequency:
      guidance.curveVertical === 'above'
        ? config.highFrequency
        : config.lowFrequency,
    // Pan toward the point: point left → negative (left) pan, point right →
    // positive (right) pan. The audio "pulls" the user toward the data.
    pan:
      guidance.curveHorizontal === 'left'
        ? -config.panMagnitude
        : config.panMagnitude,
    interval,
  };
}
