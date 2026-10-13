import { describe, expect, it } from '@jest/globals';
import { Color } from '@util/color';

describe('Color.parseRgba', () => {
  it('should read an opaque colour as browsers serialise it', () => {
    const colour = 'rgb(17, 24, 39)';

    const rgba = Color.parseRgba(colour);

    expect(rgba).toEqual({ r: 17, g: 24, b: 39, a: 1 });
  });

  it('should keep the alpha of a translucent colour', () => {
    const colour = 'rgba(0, 0, 0, 0.5)';

    const rgba = Color.parseRgba(colour);

    expect(rgba).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('should read the space-separated form with a percentage alpha', () => {
    const colour = 'rgb(255 128 0.5 / 25%)';

    const rgba = Color.parseRgba(colour);

    expect(rgba).toEqual({ r: 255, g: 128, b: 0.5, a: 0.25 });
  });

  it('should not read a colour left in another space', () => {
    const colours = ['oklch(0.3 0.02 250)', 'color(srgb 0.1 0.2 0.3)', 'lab(20 0 0)', 'canvas', ''];

    const parsed = colours.map(colour => Color.parseRgba(colour));

    expect(parsed).toEqual([null, null, null, null, null]);
  });
});
