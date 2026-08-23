/**
 * A rectangle in viewport (client) pixels, as `getBoundingClientRect` reports.
 */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A point in dot coordinates.
 */
export interface DotPoint {
  x: number;
  y: number;
}

/**
 * Which way a pan step moves the window over the plot.
 */
export type PanDirection = 'left' | 'right' | 'up' | 'down';

/**
 * How a chart's own proportions are treated when it is mapped onto the pins.
 *
 * `stretch` spends every pin, which is what most charts want: a bar chart's
 * shape carries nothing, and letterboxing it would throw away rows a fingertip
 * could have used to tell two bar heights apart.
 *
 * `preserve` keeps the chart's aspect ratio at the cost of leaving pins unused.
 * A pie, a radar, a chord diagram and a map are read by their shape, and
 * stretching one does not blur it — it misreports it. A circle arriving as a
 * 1.5:1 ellipse makes a wedge at the top subtend a different arc from the same
 * wedge at the side, so the reader concludes one slice is bigger than the
 * other when the data says they are equal.
 */
export type TactileAspect = 'stretch' | 'preserve';

/**
 * Maps a region of a chart, in viewport pixels, onto a tactile display's dot
 * grid, with a zoom level and a pan position.
 *
 * Zoom exists because the dot grid is small enough that a whole chart scaled
 * into it loses the detail that distinguishes neighbouring marks. Zooming in
 * spends the same pins on a smaller slice of the chart, which is the only way
 * to resolve marks that would otherwise share a pin — at the cost of having to
 * pan to reach the rest.
 */
export class TactileViewport {
  /**
   * Zoom levels, in the order stepping through them visits. Level 1 fits the
   * whole plot. The steps grow multiplicatively so each press changes the
   * granularity by a noticeable amount rather than creeping.
   */
  private static readonly ZOOM_STEPS: readonly number[] = [1, 1.5, 2, 3, 4, 6, 8, 12];

  /**
   * Fraction of the visible window one pan step moves. Less than a full window
   * so the reader keeps some context across the step.
   */
  private static readonly PAN_STEP = 0.5;

  /**
   * Smallest centre shift that counts as having moved.
   *
   * At zoom levels whose window width is not exact in binary, clamping leaves
   * the centre a fraction of an ULP short of the edge, so an exact comparison
   * reports one more pan as a real move. The reader then gets a frame redrawn
   * identically and an announcement of a position that did not change, instead
   * of being told they are at the edge of the chart. A dot is 1/60th of the
   * view at most, so anything below this is invisible to a fingertip.
   */
  private static readonly PAN_EPSILON = 1e-9;

  /**
   * Pins left clear around the drawn area, on every side.
   *
   * Without it the plot is mapped edge to edge and a mark on the boundary sits
   * on the outermost pin row, where three things go wrong at once: a bar's
   * baseline falls off the grid so its outline never closes and it reads as an
   * open channel; a curve that touches the top is indistinguishable from one
   * clipped by it, so the reader cannot tell a real maximum from a truncated
   * one; and a mark lying along an edge is felt as the frame of the device
   * rather than as data. One pin costs 5% of the height and buys the
   * difference between a closed shape and an open one.
   */
  private static readonly MARGIN_DOTS = 1;

  /**
   * Least of the grid a shape-preserving mapping may leave in use.
   *
   * Keeping a chart's proportions costs pins, and how many depends on how far
   * its own shape is from the grid's. A dial is about as tall as it is wide and
   * loses a third of the width — worth it, since a stretched dial misreports
   * the reading it exists to give. A long thin chart would lose almost
   * everything: fitted whole, an eight-to-one bar comes out five pins tall,
   * which is not a more faithful picture but a smaller one.
   *
   * This matters because a trace type is not always one shape. `gauge` covers
   * both the dial and the bullet chart, and the model carries nothing that
   * tells them apart — a bullet chart's target marker is also drawn on plenty
   * of dials. Rather than guess from the type, this measures what preserving
   * would actually cost and declines when the answer is most of the display.
   */
  private static readonly MIN_PRESERVED_SHARE = 0.25;

  /**
   * The chart region being mapped, in viewport pixels.
   */
  private source: ClientRect;

  /**
   * Dots across the display.
   */
  private readonly dotWidth: number;

  /**
   * Dots down the display.
   */
  private readonly dotHeight: number;

  /**
   * Index into {@link ZOOM_STEPS}.
   */
  private zoomIndex = 0;

  /**
   * Centre of the visible window, as a fraction of the source rect.
   */
  private centre: DotPoint = { x: 0.5, y: 0.5 };

  /**
   * Whether the chart's own proportions are kept.
   */
  private readonly aspect: TactileAspect;

  /**
   * @param source - The chart region to map, in viewport pixels
   * @param dotWidth - Dots across the display
   * @param dotHeight - Dots down the display
   * @param aspect - Whether to keep the chart's proportions; defaults to
   * spending every pin
   */
  public constructor(
    source: ClientRect,
    dotWidth: number,
    dotHeight: number,
    aspect: TactileAspect = 'stretch',
  ) {
    this.source = source;
    this.dotWidth = dotWidth;
    this.dotHeight = dotHeight;
    this.aspect = aspect;
  }

  /**
   * Current zoom factor, where 1 fits the whole plot.
   */
  public get zoom(): number {
    return TactileViewport.ZOOM_STEPS[this.zoomIndex];
  }

  /**
   * True when the whole plot is visible, so panning would do nothing.
   */
  public get isWholePlotVisible(): boolean {
    return this.zoomIndex === 0;
  }

  /**
   * Replaces the chart region, keeping the zoom and pan position. Called when
   * the chart resizes or a different subplot takes focus.
   * @param source - The new chart region, in viewport pixels
   */
  public setSource(source: ClientRect): void {
    this.source = source;
  }

  /**
   * Half the width of the visible window, as a fraction of the source rect.
   */
  private get halfWindow(): number {
    return 0.5 / this.zoom;
  }

  /**
   * Keeps the window inside the source rect. At zoom 1 the window is the whole
   * rect, so the centre is pinned rather than clamped to a range of zero width.
   */
  private clampCentre(): void {
    const half = this.halfWindow;
    const min = half;
    const max = 1 - half;
    if (min >= max) {
      this.centre = { x: 0.5, y: 0.5 };
      return;
    }
    this.centre = {
      x: Math.min(Math.max(this.centre.x, min), max),
      y: Math.min(Math.max(this.centre.y, min), max),
    };
  }

  /**
   * Zooms in one step.
   * @returns True when the zoom level changed
   */
  public zoomIn(): boolean {
    if (this.zoomIndex >= TactileViewport.ZOOM_STEPS.length - 1) {
      return false;
    }
    this.zoomIndex++;
    this.clampCentre();
    return true;
  }

  /**
   * Zooms out one step.
   * @returns True when the zoom level changed
   */
  public zoomOut(): boolean {
    if (this.zoomIndex <= 0) {
      return false;
    }
    this.zoomIndex--;
    this.clampCentre();
    return true;
  }

  /**
   * Resets to the whole plot, centred.
   */
  public reset(): void {
    this.zoomIndex = 0;
    this.centre = { x: 0.5, y: 0.5 };
  }

  /**
   * Moves the window one step in a direction.
   * @param direction - Which way to move the window over the plot
   * @returns True when the window actually moved, false when already at that edge
   */
  public pan(direction: PanDirection): boolean {
    if (this.isWholePlotVisible) {
      return false;
    }

    const step = this.halfWindow * 2 * TactileViewport.PAN_STEP;
    const before = { ...this.centre };

    switch (direction) {
      case 'left':
        this.centre.x -= step;
        break;
      case 'right':
        this.centre.x += step;
        break;
      case 'up':
        this.centre.y -= step;
        break;
      case 'down':
        this.centre.y += step;
        break;
    }

    this.clampCentre();
    return Math.abs(this.centre.x - before.x) > TactileViewport.PAN_EPSILON
      || Math.abs(this.centre.y - before.y) > TactileViewport.PAN_EPSILON;
  }

  /**
   * Converts a viewport-pixel point to dot coordinates. The result may fall
   * outside the dot grid, which means the point is outside the visible window.
   * @param clientX - Horizontal position in viewport pixels
   * @param clientY - Vertical position in viewport pixels
   */
  public toDot(clientX: number, clientY: number): DotPoint {
    const { left, top, width, height } = this.source;
    if (width <= 0 || height <= 0) {
      return { x: Number.NaN, y: Number.NaN };
    }

    const half = this.halfWindow;
    const span = half * 2;
    const normalizedX = (clientX - left) / width;
    const normalizedY = (clientY - top) / height;

    // Into the inset grid, not the whole one — see {@link MARGIN_DOTS}.
    const margin = TactileViewport.MARGIN_DOTS;
    const usableWidth = Math.max(1, this.dotWidth - 1 - margin * 2);
    const usableHeight = Math.max(1, this.dotHeight - 1 - margin * 2);

    const unitX = (normalizedX - (this.centre.x - half)) / span;
    const unitY = (normalizedY - (this.centre.y - half)) / span;

    if (this.aspect === 'stretch') {
      return {
        x: margin + unitX * usableWidth,
        y: margin + unitY * usableHeight,
      };
    }

    // One scale for both axes, and the leftover pins split evenly so the chart
    // sits in the middle of the grid rather than in a corner. `width / height`
    // is the shape the chart was drawn in; the scale that fits it is whichever
    // of the two leaves it inside the grid.
    const scale = Math.min(usableWidth / width, usableHeight / height);
    const drawnWidth = width * scale;
    const drawnHeight = height * scale;
    if ((drawnWidth * drawnHeight) / (usableWidth * usableHeight)
      < TactileViewport.MIN_PRESERVED_SHARE) {
      // Too little left to be worth it — see {@link MIN_PRESERVED_SHARE}.
      return {
        x: margin + unitX * usableWidth,
        y: margin + unitY * usableHeight,
      };
    }
    return {
      x: margin + (usableWidth - drawnWidth) / 2 + unitX * drawnWidth,
      y: margin + (usableHeight - drawnHeight) / 2 + unitY * drawnHeight,
    };
  }

  /**
   * Reports whether a viewport-pixel rectangle is entirely inside the visible
   * window.
   * @param rect - The rectangle to test, in viewport pixels
   */
  public containsRect(rect: ClientRect): boolean {
    const topLeft = this.toDot(rect.left, rect.top);
    const bottomRight = this.toDot(rect.left + rect.width, rect.top + rect.height);
    return topLeft.x >= 0
      && topLeft.y >= 0
      && bottomRight.x <= this.dotWidth - 1
      && bottomRight.y <= this.dotHeight - 1;
  }

  /**
   * Centres the window on a viewport-pixel rectangle.
   *
   * Used to follow the focused mark when navigation takes it off the visible
   * window. Following only on exit — rather than recentring on every move —
   * leaves a manually chosen pan position alone for as long as it still shows
   * what the reader is pointing at.
   *
   * @param rect - The rectangle to centre on, in viewport pixels
   */
  public centreOn(rect: ClientRect): void {
    const { left, top, width, height } = this.source;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.centre = {
      x: (rect.left + rect.width / 2 - left) / width,
      y: (rect.top + rect.height / 2 - top) / height,
    };
    this.clampCentre();
  }

  /**
   * Describes the current zoom and pan for announcement to the reader.
   *
   * A zoomed view shows a slice of the chart with no visible frame to say which
   * slice, so the position has to be spoken.
   */
  public describe(): string {
    if (this.isWholePlotVisible) {
      return 'Whole plot';
    }
    const percentX = Math.round(this.centre.x * 100);
    const percentY = Math.round(this.centre.y * 100);
    return `Zoom ${this.zoom}x, centred ${percentX}% across and ${percentY}% down`;
  }
}
