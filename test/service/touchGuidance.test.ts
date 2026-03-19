import {
  DEFAULT_TOUCH_GUIDANCE_CONFIG,
  resolveTouchGuidanceBeep,
} from '@service/touchGuidance';

describe('resolveTouchGuidanceBeep', () => {
  it('returns null for on-curve guidance', () => {
    const beep = resolveTouchGuidanceBeep({
      onCurve: true,
      distancePx: 0,
      verticalRelation: 'below',
      horizontalRelation: 'left',
    });

    expect(beep).toBeNull();
  });

  it('maps directional cues to pitch and pan', () => {
    const belowLeft = resolveTouchGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      verticalRelation: 'below',
      horizontalRelation: 'left',
    });
    const aboveRight = resolveTouchGuidanceBeep({
      onCurve: false,
      distancePx: 10,
      verticalRelation: 'above',
      horizontalRelation: 'right',
    });

    expect(belowLeft?.frequency).toBe(DEFAULT_TOUCH_GUIDANCE_CONFIG.highFrequency);
    expect(belowLeft?.pan).toBe(DEFAULT_TOUCH_GUIDANCE_CONFIG.panMagnitude);

    expect(aboveRight?.frequency).toBe(DEFAULT_TOUCH_GUIDANCE_CONFIG.lowFrequency);
    expect(aboveRight?.pan).toBe(-DEFAULT_TOUCH_GUIDANCE_CONFIG.panMagnitude);
  });

  it('beep interval gets shorter as pointer gets closer', () => {
    const far = resolveTouchGuidanceBeep({
      onCurve: false,
      distancePx: DEFAULT_TOUCH_GUIDANCE_CONFIG.maxDistancePx,
      verticalRelation: 'above',
      horizontalRelation: 'left',
    });
    const near = resolveTouchGuidanceBeep({
      onCurve: false,
      distancePx: 1,
      verticalRelation: 'above',
      horizontalRelation: 'left',
    });

    expect(far).not.toBeNull();
    expect(near).not.toBeNull();
    expect((near?.interval ?? 1) < (far?.interval ?? 0)).toBe(true);
  });
});
