/**
 * `TactileViewport` is the whole zoom-and-pan model behind Ctrl+Plus,
 * Ctrl+Minus and the DotPad's own panning keys. Everything downstream — the
 * raster, the packed cells, the pins — is a faithful rendering of whatever
 * window this class says is visible, so an off-by-one in the window maths does
 * not surface as an exception or a blank display. It surfaces as a chart that
 * has quietly scrolled a little past its own edge, or as marks squeezed one
 * pin short of the grid, and the only instrument pointed at it is a fingertip.
 * A fingertip cannot tell a chart drawn slightly wrong from a chart of
 * slightly wrong data.
 *
 * So the arithmetic is pinned here from the outside, through `toDot` alone.
 * The class is pure — no DOM, no device — and every claim below is stated as
 * "this client pixel lands on this dot", which is the only thing a reader can
 * actually feel. Nothing reaches into `centre` or `zoomIndex`; a test that did
 * would keep passing through the exact rewrite of the window maths it exists
 * to catch.
 *
 * Four properties carry the weight:
 *
 * - At zoom 1 the source rect maps onto the grid one pin in from each edge,
 *   dot 1 to dot 58 across. The grid is addressed by pin index, so the last
 *   dot is `dotWidth - 1`; scaling by `dotWidth` instead loses the right-hand
 *   column off the end of the display. The inset is what lets a mark on the
 *   boundary close its own outline and be told apart from the frame.
 * - Panning clamps the window inside the chart. The refusal matters as much as
 *   the move: `pan` returning false is what tells the service to announce an
 *   edge rather than re-send an identical frame, and a window allowed past the
 *   edge spends pins on blank space the reader has no way to identify.
 * - Zooming in and back out is a round trip. Zoom recentres nothing, so a
 *   reader who overshoots with Ctrl+Plus and steps back must find the chart
 *   where they left it.
 * - A degenerate source rect yields NaN, not Infinity. A chart that is
 *   detached or not yet laid out measures zero, and NaN coordinates get
 *   dropped downstream while infinities survive the comparisons and draw
 *   garbage.
 */

import type { ClientRect, PanDirection } from '@util/tactile/viewport';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { TactileViewport } from '@util/tactile/viewport';

/** A plausible plot area in viewport pixels: x 100..500, y 50..250. */
const SOURCE: ClientRect = { left: 100, top: 50, width: 400, height: 200 };

/** The DotPad 320's pin geometry. */
const DOT_WIDTH = 60;
const DOT_HEIGHT = 40;

/** Last addressable pin on each axis. */
/**
 * The outermost pin the drawn area may reach, on each axis.
 *
 * One pin in from the physical edge on every side. A mark on the boundary pin
 * cannot close its own outline — a bar loses its baseline and reads as an open
 * channel — and cannot be told apart from a mark the grid clipped, or from the
 * frame of the device itself.
 */
const MARGIN = 1;
const FIRST_X = MARGIN;
/** Dot the middle of the drawn area lands on. */
const CENTRE_X = (MARGIN + (DOT_WIDTH - 1 - MARGIN)) / 2;
const CENTRE_Y = (MARGIN + (DOT_HEIGHT - 1 - MARGIN)) / 2;
const FIRST_Y = MARGIN;
const LAST_X = DOT_WIDTH - 1 - MARGIN;
const LAST_Y = DOT_HEIGHT - 1 - MARGIN;

/** Corners and centre of {@link SOURCE}, in viewport pixels. */
const RIGHT = SOURCE.left + SOURCE.width;
const BOTTOM = SOURCE.top + SOURCE.height;
const MID_X = SOURCE.left + SOURCE.width / 2;
const MID_Y = SOURCE.top + SOURCE.height / 2;

/**
 * Pans until the viewport refuses, so a test can assert where the window comes
 * to rest without hard-coding how many steps a zoom level takes.
 * @param viewport The viewport to pan
 * @param direction Which way to keep moving
 * @returns How many steps actually moved the window
 * @throws If the viewport never refuses, which would mean an unclamped window
 */
function panToEdge(viewport: TactileViewport, direction: PanDirection): number {
  let steps = 0;
  while (viewport.pan(direction)) {
    steps++;
    if (steps > 100) {
      throw new Error(`pan('${direction}') never reached an edge`);
    }
  }
  return steps;
}

/**
 * Steps the zoom in until it refuses.
 * @param viewport The viewport to zoom
 * @returns Every zoom factor visited after the starting one
 */
function zoomToMaximum(viewport: TactileViewport): number[] {
  const visited: number[] = [];
  while (viewport.zoomIn()) {
    visited.push(viewport.zoom);
    if (visited.length > 100) {
      throw new Error('zoomIn() never reached a maximum');
    }
  }
  return visited;
}

describe('tactileViewport at the default zoom', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should map the whole source rect onto the grid, one pin in from each edge', () => {
    const topLeft = viewport.toDot(SOURCE.left, SOURCE.top);
    const bottomRight = viewport.toDot(RIGHT, BOTTOM);

    expect(topLeft).toEqual({ x: FIRST_X, y: FIRST_Y });
    expect(bottomRight).toEqual({ x: LAST_X, y: LAST_Y });
  });

  it('should map the centre of the source rect to the middle of the grid', () => {
    const centre = viewport.toDot(MID_X, MID_Y);

    expect(centre.x).toBeCloseTo(CENTRE_X);
    expect(centre.y).toBeCloseTo(CENTRE_Y);
  });

  it('should report the whole plot visible at zoom 1', () => {
    expect(viewport.zoom).toBe(1);
    expect(viewport.isWholePlotVisible).toBe(true);
  });

  it('should place a point outside the source rect outside the grid', () => {
    const beyondRight = viewport.toDot(RIGHT + SOURCE.width, MID_Y);

    expect(beyondRight.x).toBeGreaterThan(LAST_X);
  });
});

describe('tactileViewport zoom stepping', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should raise the zoom through the documented steps', () => {
    const visited = zoomToMaximum(viewport);

    expect(visited).toEqual([1.5, 2, 3, 4, 6, 8, 12]);
  });

  it('should refuse to zoom in past the maximum without changing the zoom', () => {
    zoomToMaximum(viewport);

    const moved = viewport.zoomIn();

    expect(moved).toBe(false);
    expect(viewport.zoom).toBe(12);
  });

  it('should refuse to zoom out at the minimum without changing the zoom', () => {
    const moved = viewport.zoomOut();

    expect(moved).toBe(false);
    expect(viewport.zoom).toBe(1);
  });

  it('should stop reporting the whole plot once zoomed in', () => {
    viewport.zoomIn();

    expect(viewport.isWholePlotVisible).toBe(false);
    expect(viewport.zoom).toBe(1.5);
  });

  it('should return to the original mapping after zooming in and back out', () => {
    const before = viewport.toDot(250, 120);

    viewport.zoomIn();
    viewport.zoomIn();
    viewport.zoomOut();
    viewport.zoomOut();

    const after = viewport.toDot(250, 120);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(viewport.isWholePlotVisible).toBe(true);
  });
});

describe('tactileViewport panning', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should refuse to pan while the whole plot is visible', () => {
    const before = viewport.toDot(MID_X, MID_Y);

    const moved = viewport.pan('right');

    expect(moved).toBe(false);
    expect(viewport.toDot(MID_X, MID_Y)).toEqual(before);
  });

  it('should move the window right so a fixed point lands on a smaller dot', () => {
    viewport.zoomIn();
    viewport.zoomIn();
    const before = viewport.toDot(MID_X, MID_Y);

    const moved = viewport.pan('right');

    expect(moved).toBe(true);
    expect(viewport.toDot(MID_X, MID_Y).x).toBeLessThan(before.x);
  });

  it('should move the window down so a fixed point lands on a smaller dot', () => {
    viewport.zoomIn();
    viewport.zoomIn();
    const before = viewport.toDot(MID_X, MID_Y);

    const moved = viewport.pan('down');

    expect(moved).toBe(true);
    expect(viewport.toDot(MID_X, MID_Y).y).toBeLessThan(before.y);
  });

  it('should clamp the window to the right edge of the source rect', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const steps = panToEdge(viewport, 'right');

    expect(steps).toBeGreaterThan(0);
    expect(viewport.toDot(RIGHT, MID_Y).x).toBeLessThanOrEqual(LAST_X);
    expect(viewport.toDot(RIGHT, MID_Y).x).toBeCloseTo(LAST_X);
  });

  it('should clamp the window to the left edge of the source rect', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const steps = panToEdge(viewport, 'left');

    expect(steps).toBeGreaterThan(0);
    expect(viewport.toDot(SOURCE.left, MID_Y).x).toBeGreaterThanOrEqual(FIRST_X);
    expect(viewport.toDot(SOURCE.left, MID_Y).x).toBeCloseTo(FIRST_X);
  });

  it('should clamp the window to the top edge of the source rect', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const steps = panToEdge(viewport, 'up');

    expect(steps).toBeGreaterThan(0);
    expect(viewport.toDot(MID_X, SOURCE.top).y).toBeGreaterThanOrEqual(FIRST_Y);
    expect(viewport.toDot(MID_X, SOURCE.top).y).toBeCloseTo(FIRST_Y);
  });

  it('should clamp the window to the bottom edge of the source rect', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const steps = panToEdge(viewport, 'down');

    expect(steps).toBeGreaterThan(0);
    expect(viewport.toDot(MID_X, BOTTOM).y).toBeLessThanOrEqual(LAST_Y);
    expect(viewport.toDot(MID_X, BOTTOM).y).toBeCloseTo(LAST_Y);
  });

  it('should stay clamped at the deepest zoom, where the steps are smallest', () => {
    zoomToMaximum(viewport);

    panToEdge(viewport, 'right');
    panToEdge(viewport, 'down');

    expect(viewport.toDot(RIGHT, BOTTOM).x).toBeLessThanOrEqual(LAST_X);
    expect(viewport.toDot(RIGHT, BOTTOM).y).toBeLessThanOrEqual(LAST_Y);
  });

  it('should leave the other axis alone while panning one of them', () => {
    viewport.zoomIn();
    viewport.zoomIn();
    const before = viewport.toDot(MID_X, MID_Y);

    viewport.pan('right');

    expect(viewport.toDot(MID_X, MID_Y).y).toBeCloseTo(before.y);
  });
});

describe('tactileViewport containsRect', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should contain the whole source rect at zoom 1', () => {
    expect(viewport.containsRect(SOURCE)).toBe(true);
  });

  it('should contain a rect inside the visible window after zooming in', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const inside = viewport.containsRect({ left: 250, top: 110, width: 50, height: 20 });

    expect(inside).toBe(true);
  });

  it('should not contain a rect outside the visible window after zooming in', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const inside = viewport.containsRect({ left: 110, top: 60, width: 20, height: 10 });

    expect(inside).toBe(false);
  });

  it('should not contain a rect that straddles the edge of the window', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    const inside = viewport.containsRect({ left: 380, top: 110, width: 60, height: 20 });

    expect(inside).toBe(false);
  });
});

describe('tactileViewport centreOn', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should put the centre of a rect at the middle of the dot grid', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    viewport.centreOn({ left: 190, top: 90, width: 20, height: 20 });

    const centre = viewport.toDot(200, 100);
    expect(centre.x).toBeCloseTo(CENTRE_X);
    expect(centre.y).toBeCloseTo(CENTRE_Y);
  });

  it('should bring a mark outside the window back into view', () => {
    viewport.zoomIn();
    viewport.zoomIn();
    const mark: ClientRect = { left: 190, top: 90, width: 20, height: 20 };

    viewport.centreOn(mark);

    expect(viewport.containsRect(mark)).toBe(true);
  });

  it('should clamp so centring on a corner mark leaves the view on the chart', () => {
    viewport.zoomIn();
    viewport.zoomIn();
    const corner: ClientRect = { left: SOURCE.left, top: SOURCE.top, width: 8, height: 4 };

    viewport.centreOn(corner);

    expect(viewport.toDot(SOURCE.left, SOURCE.top)).toEqual({ x: FIRST_X, y: FIRST_Y });
    expect(viewport.toDot(104, 52).x).toBeGreaterThan(0);
    expect(viewport.toDot(104, 52).x).toBeLessThan(CENTRE_X);
  });

  it('should keep the whole plot centred when zoom 1 leaves nowhere to move', () => {
    viewport.centreOn({ left: SOURCE.left, top: SOURCE.top, width: 8, height: 4 });

    expect(viewport.toDot(SOURCE.left, SOURCE.top)).toEqual({ x: FIRST_X, y: FIRST_Y });
    expect(viewport.toDot(RIGHT, BOTTOM)).toEqual({ x: LAST_X, y: LAST_Y });
  });
});

describe('tactileViewport reset and setSource', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should return to the whole plot on reset', () => {
    viewport.zoomIn();
    viewport.zoomIn();
    viewport.pan('right');

    viewport.reset();

    expect(viewport.zoom).toBe(1);
    expect(viewport.isWholePlotVisible).toBe(true);
    expect(viewport.toDot(SOURCE.left, SOURCE.top)).toEqual({ x: FIRST_X, y: FIRST_Y });
    expect(viewport.toDot(RIGHT, BOTTOM)).toEqual({ x: LAST_X, y: LAST_Y });
  });

  it('should keep the current zoom level when the source rect changes', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    viewport.setSource({ left: 0, top: 0, width: 800, height: 400 });

    expect(viewport.zoom).toBe(2);
    expect(viewport.isWholePlotVisible).toBe(false);
  });

  it('should map against the new source rect after setSource', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    viewport.setSource({ left: 0, top: 0, width: 800, height: 400 });

    const centre = viewport.toDot(400, 200);
    expect(centre.x).toBeCloseTo(CENTRE_X);
    expect(centre.y).toBeCloseTo(CENTRE_Y);
  });
});

describe('tactileViewport with a degenerate source rect', () => {
  it('should map to NaN rather than Infinity when the source has no width', () => {
    const viewport = new TactileViewport({ left: 100, top: 50, width: 0, height: 200 }, DOT_WIDTH, DOT_HEIGHT);

    const dot = viewport.toDot(100, 150);

    expect(Number.isNaN(dot.x)).toBe(true);
    expect(Number.isNaN(dot.y)).toBe(true);
  });

  it('should map to NaN rather than Infinity when the source has no height', () => {
    const viewport = new TactileViewport({ left: 100, top: 50, width: 400, height: 0 }, DOT_WIDTH, DOT_HEIGHT);

    const dot = viewport.toDot(300, 50);

    expect(Number.isNaN(dot.x)).toBe(true);
    expect(Number.isNaN(dot.y)).toBe(true);
  });

  it('should not claim to contain anything while the source has no area', () => {
    const viewport = new TactileViewport({ left: 100, top: 50, width: 0, height: 0 }, DOT_WIDTH, DOT_HEIGHT);

    expect(viewport.containsRect({ left: 100, top: 50, width: 0, height: 0 })).toBe(false);
  });

  it('should ignore centreOn while the source has no area', () => {
    const viewport = new TactileViewport({ left: 100, top: 50, width: 0, height: 200 }, DOT_WIDTH, DOT_HEIGHT);
    viewport.zoomIn();

    viewport.centreOn({ left: 100, top: 50, width: 10, height: 10 });

    viewport.setSource(SOURCE);
    expect(viewport.toDot(MID_X, MID_Y).x).toBeCloseTo(CENTRE_X);
  });
});

describe('tactileViewport describe', () => {
  let viewport: TactileViewport;

  beforeEach(() => {
    viewport = new TactileViewport(SOURCE, DOT_WIDTH, DOT_HEIGHT);
  });

  it('should say the whole plot is shown at zoom 1', () => {
    expect(viewport.describe()).toBe('Whole plot');
  });

  it('should name the zoom factor once zoomed in', () => {
    viewport.zoomIn();

    const spoken = viewport.describe();

    expect(spoken).toContain('1.5x');
    expect(spoken).not.toContain('Whole plot');
  });

  it('should name the pan position once the window has moved', () => {
    viewport.zoomIn();
    viewport.zoomIn();

    viewport.pan('right');

    expect(viewport.describe()).toBe('Zoom 2x, centred 75% across and 50% down');
  });

  it('should say the whole plot is shown again after reset', () => {
    viewport.zoomIn();
    viewport.pan('right');

    viewport.reset();

    expect(viewport.describe()).toBe('Whole plot');
  });
});

describe('tactileViewport with the chart\'s proportions preserved', () => {
  /**
   * A source rect twice as wide as it is tall, onto a grid that is 60 by 40 —
   * so stretching and preserving give visibly different answers.
   */
  const WIDE: ClientRect = { left: 0, top: 0, width: 400, height: 200 };

  it('should map a square region to a square patch of pins', () => {
    // A pie, a radar, a chord ring, a map. Stretching one of these does not
    // blur it, it misreports it: a circle arriving as a 1.5:1 ellipse makes a
    // wedge at the top subtend a different arc from the same wedge at the
    // side, so the reader concludes one slice is bigger when the data says
    // they are equal.
    const square: ClientRect = { left: 0, top: 0, width: 200, height: 200 };
    const viewport = new TactileViewport(square, DOT_WIDTH, DOT_HEIGHT, 'preserve');

    const topLeft = viewport.toDot(square.left, square.top);
    const bottomRight = viewport.toDot(square.left + square.width, square.top + square.height);

    expect(bottomRight.x - topLeft.x).toBeCloseTo(bottomRight.y - topLeft.y);
  });

  it('should centre the leftover pins rather than pushing the chart into a corner', () => {
    const square: ClientRect = { left: 0, top: 0, width: 200, height: 200 };
    const viewport = new TactileViewport(square, DOT_WIDTH, DOT_HEIGHT, 'preserve');

    const left = viewport.toDot(square.left, square.top).x;
    const right = viewport.toDot(square.left + square.width, square.top).x;

    expect(left - MARGIN).toBeCloseTo((DOT_WIDTH - 1 - MARGIN) - right);
  });

  it('should still spend every pin when the shape carries nothing', () => {
    // A bar chart. Letterboxing it would throw away rows a fingertip could
    // have used to tell two bar heights apart.
    const viewport = new TactileViewport(WIDE, DOT_WIDTH, DOT_HEIGHT, 'stretch');

    const topLeft = viewport.toDot(WIDE.left, WIDE.top);
    const bottomRight = viewport.toDot(WIDE.left + WIDE.width, WIDE.top + WIDE.height);

    expect(topLeft).toEqual({ x: FIRST_X, y: FIRST_Y });
    expect(bottomRight).toEqual({ x: LAST_X, y: LAST_Y });
  });

  it('should default to spending every pin', () => {
    const stretched = new TactileViewport(WIDE, DOT_WIDTH, DOT_HEIGHT);

    expect(stretched.toDot(WIDE.left + WIDE.width, WIDE.top + WIDE.height))
      .toEqual({ x: LAST_X, y: LAST_Y });
  });
});
