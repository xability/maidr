import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_POINTER_GUIDANCE_CONFIG,
  resolvePointerGuidanceBeep,
} from '@service/pointerGuidance';

describe('resolvePointerGuidanceBeep', () => {
  it('returns null for on-curve guidance', () => {
    const beep = resolvePointerGuidanceBeep({ onCurve: true });

    expect(beep).toBeNull();
  });

  it('returns null when pointer is beyond maxDistancePx', () => {
    const beep = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: DEFAULT_POINTER_GUIDANCE_CONFIG.maxDistancePx + 1,
      curveVertical: 'above',
      curveHorizontal: 'right',
    });

    expect(beep).toBeNull();
  });

  it('maps directional cues to pitch and pan', () => {
    // Curve point is above and to the right (cursor below-left of curve).
    const pointAboveRight = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      curveVertical: 'above',
      curveHorizontal: 'right',
    });
    // Curve point is below and to the left (cursor above-right of curve).
    const pointBelowLeft = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      curveVertical: 'below',
      curveHorizontal: 'left',
    });

    expect(pointAboveRight?.frequency).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.highFrequency);
    expect(pointAboveRight?.pan).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.panMagnitude);

    expect(pointBelowLeft?.frequency).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.lowFrequency);
    expect(pointBelowLeft?.pan).toBe(-DEFAULT_POINTER_GUIDANCE_CONFIG.panMagnitude);
  });

  it('returns pan = 0 when the curve is exactly aligned horizontally', () => {
    // Cursor sits directly above/below a heatmap cell center: panning
    // horizontally would be a misleading directional cue.
    const centered = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      curveVertical: 'above',
      curveHorizontal: 'center',
    });

    expect(centered?.pan).toBe(0);
    expect(centered?.frequency).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.highFrequency);
  });

  it('beep interval gets shorter as pointer gets closer', () => {
    const far = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: DEFAULT_POINTER_GUIDANCE_CONFIG.maxDistancePx,
      curveVertical: 'below',
      curveHorizontal: 'right',
    });
    const near = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 1,
      curveVertical: 'below',
      curveHorizontal: 'right',
    });

    expect(far).not.toBeNull();
    expect(near).not.toBeNull();
    expect((near?.interval ?? 1) < (far?.interval ?? 0)).toBe(true);
  });
});
