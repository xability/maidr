import {
  DEFAULT_POINTER_GUIDANCE_CONFIG,
  resolvePointerGuidanceBeep,
} from '@service/pointerGuidance';

describe('resolvePointerGuidanceBeep', () => {
  it('returns null for on-curve guidance', () => {
    const beep = resolvePointerGuidanceBeep({
      onCurve: true,
      distancePx: 0,
      cursorVerticalPosition: 'below',
      cursorHorizontalPosition: 'left',
    });

    expect(beep).toBeNull();
  });

  it('returns null when pointer is beyond maxDistancePx', () => {
    const beep = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: DEFAULT_POINTER_GUIDANCE_CONFIG.maxDistancePx + 1,
      cursorVerticalPosition: 'below',
      cursorHorizontalPosition: 'left',
    });

    expect(beep).toBeNull();
  });

  it('maps directional cues to pitch and pan', () => {
    const belowLeft = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      cursorVerticalPosition: 'below',
      cursorHorizontalPosition: 'left',
    });
    const aboveRight = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      cursorVerticalPosition: 'above',
      cursorHorizontalPosition: 'right',
    });

    expect(belowLeft?.frequency).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.highFrequency);
    expect(belowLeft?.pan).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.panMagnitude);

    expect(aboveRight?.frequency).toBe(DEFAULT_POINTER_GUIDANCE_CONFIG.lowFrequency);
    expect(aboveRight?.pan).toBe(-DEFAULT_POINTER_GUIDANCE_CONFIG.panMagnitude);
  });

  it('beep interval gets shorter as pointer gets closer', () => {
    const far = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: DEFAULT_POINTER_GUIDANCE_CONFIG.maxDistancePx,
      cursorVerticalPosition: 'above',
      cursorHorizontalPosition: 'left',
    });
    const near = resolvePointerGuidanceBeep({
      onCurve: false,
      distancePx: 1,
      cursorVerticalPosition: 'above',
      cursorHorizontalPosition: 'left',
    });

    expect(far).not.toBeNull();
    expect(near).not.toBeNull();
    expect((near?.interval ?? 1) < (far?.interval ?? 0)).toBe(true);
  });
});
