/**
 * Tests for `TactileCanvas`, which turns a chart drawn on a canvas into pins.
 *
 * A canvas chart has no shapes to trace, so the pins are read off its pixels.
 * The claims pinned here are the ones a hand would notice going wrong: a solid
 * bar has to arrive as an outline, a thin line as one line rather than two, a
 * tooltip must not leave a boundary where it sat, and two marks drawn flush
 * against each other must still be told apart.
 */

import type { PixelImage, PixelRect } from '@util/tactile/canvasRaster';
import { describe, expect, it } from '@jest/globals';
import { TactileCanvas } from '@util/tactile/canvasRaster';

/**
 * A white picture with coloured rectangles painted on it.
 * @param width - Pixels across
 * @param height - Pixels down
 * @param paint - Rectangles to fill, and their colours
 */
function picture(
  width: number,
  height: number,
  paint: { rect: PixelRect; colour: [number, number, number] }[] = [],
): PixelImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const { rect, colour } of paint) {
    for (let y = rect.top; y < rect.bottom; y++) {
      for (let x = rect.left; x < rect.right; x++) {
        const index = (y * width + x) * 4;
        data[index] = colour[0];
        data[index + 1] = colour[1];
        data[index + 2] = colour[2];
        data[index + 3] = 255;
      }
    }
  }
  return { data, width, height };
}

/**
 * One pin per `size` pixels, the whole picture on the pins.
 * @param size - Pixels a pin stands over, each way
 */
function grid(size: number): (x: number, y: number) => PixelRect {
  return (x, y) => ({ left: x * size, top: y * size, right: (x + 1) * size, bottom: (y + 1) * size });
}

const BLUE: [number, number, number] = [40, 90, 200];
const RED: [number, number, number] = [210, 40, 40];

describe('tactileCanvas.render', () => {
  it('should draw a solid bar as its outline, leaving its inside down', () => {
    // A field of solid marks gives a fingertip nothing to tell them apart by;
    // outlines have edges to trace, as every unfocused SVG mark does.
    const image = picture(100, 100, [{ rect: { left: 20, top: 20, right: 80, bottom: 90 }, colour: BLUE }]);

    const raster = TactileCanvas.render(image, grid(5), 20, 20);

    expect(raster.get(4, 10)).toBe(true);
    expect(raster.get(15, 10)).toBe(true);
    expect(raster.get(10, 4)).toBe(true);
    expect(raster.get(10, 10)).toBe(false);
  });

  it('should find a line one pixel wide in a pin ten pixels across', () => {
    // At rest a pin stands over a patch ten pixels across, and a line covers a
    // tenth of it. A line is exactly what must not fall through.
    const image = picture(200, 100, [{ rect: { left: 0, top: 50, right: 200, bottom: 51 }, colour: BLUE }]);

    const raster = TactileCanvas.render(image, grid(10), 20, 10);

    expect(raster.get(10, 5)).toBe(true);
  });

  it('should leave the page and pale grid lines down', () => {
    const image = picture(100, 100, [{ rect: { left: 0, top: 40, right: 100, bottom: 42 }, colour: [230, 230, 230] }]);

    const raster = TactileCanvas.render(image, grid(5), 20, 20);

    expect(raster.raisedCount).toBe(0);
  });

  it('should raise a thick line whole at close zoom, not as its two edges', () => {
    // A line a few pixels wide is a few pins wide once zoomed. Outlined like a
    // shape it arrived as two parallel lines where the chart drew one.
    const image = picture(40, 40, [{ rect: { left: 0, top: 18, right: 40, bottom: 23 }, colour: BLUE }]);

    const raster = TactileCanvas.render(image, grid(1), 40, 40, [], 6);

    for (let y = 18; y < 23; y++) {
      expect(raster.get(20, y)).toBe(true);
    }
  });

  it('should raise a sloping line whole as well', () => {
    // Across or down alone, a line at forty-five degrees measures half as
    // thick again as it is, and came back as two edges.
    const size = 60;
    const data = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.abs(x - y) <= 2) {
          const index = (y * size + x) * 4;
          data.set([BLUE[0], BLUE[1], BLUE[2], 255], index);
        }
      }
    }

    const raster = TactileCanvas.render({ data, width: size, height: size }, grid(1), size, size, [], 6);

    expect(raster.get(30, 30)).toBe(true);
  });

  it('should tell apart two marks drawn flush against each other', () => {
    const image = picture(100, 100, [
      { rect: { left: 10, top: 10, right: 50, bottom: 90 }, colour: BLUE },
      { rect: { left: 50, top: 10, right: 90, bottom: 90 }, colour: RED },
    ]);

    const raster = TactileCanvas.render(image, grid(5), 20, 20);

    // The seam between them is raised, though neither side meets the page.
    expect(raster.get(9, 10) || raster.get(10, 10)).toBe(true);
  });

  it('should leave what is under a mask alone, and draw no edge along it', () => {
    // A tooltip sits over the data. Read as the page, it cut an edge into
    // every mark it crossed, and left its own outline behind.
    const image = picture(100, 100, [
      { rect: { left: 20, top: 10, right: 80, bottom: 90 }, colour: BLUE },
      // The tooltip itself, dark on the bar.
      { rect: { left: 0, top: 40, right: 100, bottom: 60 }, colour: [30, 30, 30] },
    ]);
    const mask: PixelRect = { left: 0, top: 40, right: 100, bottom: 60 };

    const raster = TactileCanvas.render(image, grid(5), 20, 20, [mask]);

    // Inside the bar, either side of the tooltip: no edge along it.
    expect(raster.get(10, 7)).toBe(false);
    expect(raster.get(10, 12)).toBe(false);
    // Nothing of the tooltip, and the bar's own sides still there.
    expect(raster.get(2, 10)).toBe(false);
    expect(raster.get(4, 5)).toBe(true);
  });

  it('should skip a pin that stands outside the picture', () => {
    const image = picture(30, 30, [{ rect: { left: 0, top: 0, right: 10, bottom: 10 }, colour: BLUE }]);

    const raster = TactileCanvas.render(image, (x, y) => (x === 0 && y === 0 ? grid(10)(0, 0) : null), 3, 3);

    expect(raster.get(0, 0)).toBe(true);
    expect(raster.raisedCount).toBe(1);
  });
});

describe('tactileCanvas.backgroundOf', () => {
  it('should take the commonest colour as the page', () => {
    const image = picture(50, 50, [{ rect: { left: 0, top: 0, right: 50, bottom: 40 }, colour: [20, 20, 30] }]);

    expect(TactileCanvas.backgroundOf(image)).toEqual([20, 20, 30]);
  });

  it('should see a transparent canvas as the white page behind it', () => {
    const image: PixelImage = { data: new Uint8ClampedArray(20 * 20 * 4), width: 20, height: 20 };

    expect(TactileCanvas.backgroundOf(image)).toEqual([255, 255, 255]);
  });
});
