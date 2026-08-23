/**
 * Tests for the fill-colour channel.
 *
 * A heatmap, a choropleth, a hexbin and a mosaic put their whole content in
 * colour: every cell is the same size and shape, so the geometry reaching the
 * pins is a lattice and nothing else. Measured on the example gallery, a
 * heatmap spent 819 of 2400 pins drawing an 8x8 grid and delivered none of its
 * 64 values — a crisp, confident diagram containing no data.
 *
 * Density is the substitute a hand can read, and the two things that decide
 * whether it helps are tested here: that darker means denser, so a sighted
 * colleague and a blind reader describe the same chart the same way; and that
 * a chart whose fill is decoration rather than data is left alone, because
 * texturing those would fill in the hollow interiors that tell an ordinary
 * mark from the solid focused one.
 */

import { describe, expect, it } from '@jest/globals';
import { TactileShade } from '@util/tactile/shade';

describe('tactileShade.luminanceOf', () => {
  it('should read the functional form a computed style hands back', () => {
    expect(TactileShade.luminanceOf('rgb(0, 0, 0)')).toBe(0);
    expect(TactileShade.luminanceOf('rgb(255, 255, 255)')).toBeCloseTo(1);
  });

  it('should read the hex form an SVG attribute usually holds', () => {
    expect(TactileShade.luminanceOf('#000000')).toBe(0);
    expect(TactileShade.luminanceOf('#fff')).toBeCloseTo(1);
  });

  it('should weight the channels the way the eye does', () => {
    // The chart chose its colours to be told apart by eye, so the ordering
    // that matters is the one the eye would have seen. Green reads far lighter
    // than blue at the same channel value.
    const green = TactileShade.luminanceOf('rgb(0, 255, 0)');
    const blue = TactileShade.luminanceOf('rgb(0, 0, 255)');

    expect(green).not.toBeNull();
    expect(blue).not.toBeNull();
    expect(green as number).toBeGreaterThan(blue as number);
  });

  it('should report no shade for a mark that is not painted', () => {
    expect(TactileShade.luminanceOf('none')).toBeNull();
    expect(TactileShade.luminanceOf('transparent')).toBeNull();
    expect(TactileShade.luminanceOf('rgba(10, 20, 30, 0)')).toBeNull();
    expect(TactileShade.luminanceOf('')).toBeNull();
  });

  it('should report no shade for something that is not a colour', () => {
    expect(TactileShade.luminanceOf('url(#gradient)')).toBeNull();
    expect(TactileShade.luminanceOf('#12345')).toBeNull();
  });
});

describe('tactileShade.densities', () => {
  it('should raise more pins for a darker mark', () => {
    // Darker means denser: the eye reads a dark cell as more and a hand reads
    // a crowded one as more, so the two agree.
    const densities = TactileShade.densities([
      '#ffffff',
      '#cccccc',
      '#999999',
      '#666666',
      '#333333',
      '#000000',
    ]);

    expect(densities).not.toBeNull();
    const values = densities as number[];
    expect(values[0]).toBeCloseTo(0);
    expect(values[values.length - 1]).toBeCloseTo(1);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('should spread over the colours present rather than over black to white', () => {
    // A heatmap using the pale half of a ramp would otherwise come out
    // uniformly blank. It is the ordering between cells a reader needs.
    const densities = TactileShade.densities([
      '#eeeeee',
      '#eaeaea',
      '#e4e4e4',
      '#dddddd',
      '#cccccc',
      '#bbbbbb',
    ]);

    expect(densities).not.toBeNull();
    expect((densities as number[])[0]).toBeCloseTo(0);
    expect((densities as number[])[5]).toBeCloseTo(1);
  });

  it('should decline a palette, where colour names a category and not a value', () => {
    // A pie paints one colour per slice and puts the value in the angle.
    // Texturing it put two of four wedges at full density and left a third
    // empty: two solid wedges, one of them the reader's, and no way to tell.
    expect(TactileShade.densities(['#4c72b0', '#dd8452', '#55a868', '#c44e52'])).toBeNull();
  });

  it('should take a ramp, where colour is the value', () => {
    const ramp = ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'];

    expect(TactileShade.densities(ramp)).not.toBeNull();
  });

  it('should decline when fill is decoration rather than data', () => {
    // Every bar one blue. Texturing these would fill in the interiors that
    // tell a hollow mark from the solid focused one — trading a real cue for a
    // meaningless one.
    expect(TactileShade.densities(['#4c72b0', '#4c72b0', '#4c72b0'])).toBeNull();
  });

  it('should decline when rounding is the only difference', () => {
    expect(TactileShade.densities(['rgb(76, 114, 176)', 'rgb(77, 115, 177)'])).toBeNull();
  });

  it('should decline when fewer than two marks are painted at all', () => {
    expect(TactileShade.densities(['none', '#000000'])).toBeNull();
    expect(TactileShade.densities([])).toBeNull();
  });

  it('should keep unpainted marks out of the result without dropping the rest', () => {
    const densities = TactileShade.densities([
      '#ffffff',
      'none',
      '#cccccc',
      '#999999',
      '#666666',
      '#333333',
      '#000000',
    ]);

    expect(densities).not.toBeNull();
    expect((densities as (number | null)[])[1]).toBeNull();
    expect((densities as (number | null)[])[6]).toBeCloseTo(1);
  });
});
