/**
 * @jest-environment jsdom
 */

/**
 * Tests for `@util/overlayRegions`, the attributes a canvas adapter's overlay
 * uses to tell the tactile display where the plot area is and what has been
 * painted over it.
 *
 * Written by one module and read by another that never imports it, so the
 * round trip is the contract: a box written has to come back, in screen
 * coordinates, as the same box.
 */

import { describe, expect, it } from '@jest/globals';
import { OVERLAY_ATTRIBUTES, readOverlayRegions, writeOverlayRegions } from '@util/overlayRegions';

/**
 * An overlay layer sitting at a given place on the screen.
 * @param left - Its left edge
 * @param top - Its top edge
 */
function layerAt(left: number, top: number): HTMLElement {
  const layer = document.createElement('div');
  layer.getBoundingClientRect = (): DOMRect => ({
    left,
    top,
    right: left + 600,
    bottom: top + 400,
    width: 600,
    height: 400,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  return layer;
}

describe('overlayRegions', () => {
  it('should read back the plot area and exclusions in screen coordinates', () => {
    const layer = layerAt(100, 50);

    writeOverlayRegions(
      layer,
      { left: 40, top: 20, right: 580, bottom: 360 },
      [{ left: 200, top: 100, right: 300, bottom: 150 }],
    );
    const regions = readOverlayRegions(layer);

    expect(regions.plotArea).toEqual({ left: 140, top: 70, right: 680, bottom: 410 });
    expect(regions.exclude).toEqual([{ left: 300, top: 150, right: 400, bottom: 200 }]);
  });

  it('should drop a box with no area rather than write it', () => {
    const layer = layerAt(0, 0);

    writeOverlayRegions(layer, { left: 10, top: 10, right: 10, bottom: 50 }, [null]);

    expect(layer.hasAttribute(OVERLAY_ATTRIBUTES.plotArea)).toBe(false);
    expect(layer.hasAttribute(OVERLAY_ATTRIBUTES.exclude)).toBe(false);
    expect(readOverlayRegions(layer)).toEqual({ plotArea: null, exclude: [] });
  });

  it('should clear what an earlier write left once it no longer holds', () => {
    // A tooltip that has gone must not keep its patch of the chart hidden.
    const layer = layerAt(0, 0);
    writeOverlayRegions(layer, null, [{ left: 1, top: 1, right: 5, bottom: 5 }]);

    writeOverlayRegions(layer, null);

    expect(readOverlayRegions(layer).exclude).toEqual([]);
  });
});
