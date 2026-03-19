import type { TouchGuidanceState } from '@type/state';

/**
 * Derived beep parameters for touch/pointer guidance.
 */
export interface TouchGuidanceBeep {
  frequency: number;
  pan: number;
  interval: number;
}

/**
 * Configuration values used to map guidance state into audible cues.
 */
export interface TouchGuidanceConfig {
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
export const DEFAULT_TOUCH_GUIDANCE_CONFIG: TouchGuidanceConfig = {
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
export function resolveTouchGuidanceBeep(
  guidance: TouchGuidanceState | null,
  config: TouchGuidanceConfig = DEFAULT_TOUCH_GUIDANCE_CONFIG,
): TouchGuidanceBeep | null {
  if (!guidance || guidance.onCurve || guidance.distancePx > config.maxDistancePx) {
    return null;
  }

  const distanceNorm = clamp(guidance.distancePx / config.maxDistancePx, 0, 1);
  const interval = interpolate(distanceNorm, 0, 1, config.minInterval, config.maxInterval);

  return {
    frequency:
      guidance.verticalRelation === 'below'
        ? config.highFrequency
        : config.lowFrequency,
    // Inverted pan by requirement: pointer right of curve => pan left.
    pan:
      guidance.horizontalRelation === 'right'
        ? -config.panMagnitude
        : config.panMagnitude,
    interval,
  };
}

function interpolate(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
): number {
  if (fromMin === fromMax) {
    return toMin;
  }

  return ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
