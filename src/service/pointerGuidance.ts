import type { PointerGuidanceState } from '@type/state';
import { MathUtil } from '@util/math';

/**
 * Derived beep parameters for pointer/touch guidance.
 */
export interface PointerGuidanceBeep {
  frequency: number;
  pan: number;
  interval: number;
}

/**
 * Configuration values used to map guidance state into audible cues.
 */
export interface PointerGuidanceConfig {
  maxDistancePx: number;
  minInterval: number;
  maxInterval: number;
  highFrequency: number;
  lowFrequency: number;
  panMagnitude: number;
}

/**
 * Default guidance mapping configuration.
 */
export const DEFAULT_POINTER_GUIDANCE_CONFIG: PointerGuidanceConfig = {
  maxDistancePx: 160,
  minInterval: 0.08,
  maxInterval: 0.55,
  highFrequency: 1280,
  lowFrequency: 420,
  panMagnitude: 0.7,
};

/**
 * Converts directional pointer guidance into beep parameters.
 *
 * Returns null when no off-curve guidance beep should play.
 *
 * @param guidance - Directional guidance state
 * @param config - Optional configuration overriding defaults
 * @returns Beep parameters or null
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
      guidance.verticalRelation === 'below'
        ? config.highFrequency
        : config.lowFrequency,
    // Pan toward the curve: pointer left of curve → positive (right) pan,
    // pointer right of curve → negative (left) pan. The audio "pulls" the
    // user toward the data.
    pan:
      guidance.horizontalRelation === 'right'
        ? -config.panMagnitude
        : config.panMagnitude,
    interval,
  };
}
