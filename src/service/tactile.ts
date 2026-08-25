import type { Figure, Subplot, Trace } from '@model/plot';
import type { Disposable } from '@type/disposable';
import type { DotPadKey } from '@type/dotPad';
import type { Observer } from '@type/observable';
import type { FigureState, HighlightState, NonEmptyTraceState, SubplotState, TraceState } from '@type/state';
import type { TactileScene } from '@util/tactile/render';
import type { ClientRect, PanDirection, TactileAspect } from '@util/tactile/viewport';
import type { BrailleService } from './braille';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { TactileBraille } from '@util/tactile/brailleText';
import { DotPack } from '@util/tactile/pack';
import { DotRaster } from '@util/tactile/raster';
import { TactileRenderer } from '@util/tactile/render';
import { TactileShade } from '@util/tactile/shade';
import { TactileSvgGeometry } from '@util/tactile/svgGeometry';
import { TactileViewport } from '@util/tactile/viewport';
import { dotPadSession } from './dotPadSession';

/**
 * States this service observes, matching the union the other observing services
 * take.
 */
type TactileStateUnion = SubplotState | TraceState | FigureState;

/**
 * The states the display draws from.
 *
 * A trace is the ordinary case. A figure state is the multi-panel lobby, where
 * the reader is moving between panels and has not entered one: there is a chart
 * to show — the panel under the cursor — but nothing inside it is focused yet.
 */
type DrawableState = NonEmptyTraceState | Extract<FigureState, { empty: false }>;

/**
 * What a redraw did to the pins, as far as the reader can tell.
 *
 * `empty` outranks the other two: a window that lands somewhere with nothing in
 * it is the one outcome a reader cannot diagnose by touch, since a display with
 * every pin down is what a disconnected one also feels like.
 */
type FrameOutcome = 'changed' | 'unchanged' | 'empty';

/**
 * How hardware keys move the pin graphic.
 *
 * The display's own panning keys pan horizontally, which is what a reader
 * reaches for first, and the two inner function keys pan vertically — together
 * they let a zoomed-in reader cross the whole chart without taking a hand off
 * it. The outer function keys are left for the text line below, so the two
 * things a reader scrolls have their own pairs of keys and neither steals the
 * other's.
 */
const KEY_PAN: Readonly<Partial<Record<DotPadKey, PanDirection>>> = {
  panLeft: 'left',
  panRight: 'right',
  function2: 'up',
  function3: 'down',
};

/**
 * How hardware keys move along the braille text line.
 *
 * The line carries the same description review mode reads out, which runs well
 * past twenty cells, so it has to be scrollable in its own right.
 */
const KEY_TEXT_SCROLL: Readonly<Partial<Record<DotPadKey, number>>> = {
  function1: -1,
  function4: 1,
};

/**
 * Trace types whose value is the fill colour rather than the mark's shape.
 *
 * Every cell of a heatmap or a hexbin is the same size and shape, and a
 * choropleth's regions are fixed by geography — so the shape that reaches the
 * pins carries nothing and the numbers are all in the colour. Those are the
 * charts worth spending texture on.
 *
 * An explicit list rather than something inferred from the colours themselves.
 * Counting distinct shades looked principled and is not: a qualitative palette
 * is chosen to be *maximally* distinguishable, so Tableau10 offers ten shades
 * and would have been read as a scale, while a two-value heatmap offers two and
 * would have been read as decoration. The question is what the chart meant by
 * its colours, and only the chart knows.
 *
 * A pie, a bar and a treemap are deliberately absent: their colour names a
 * category and their size is the value. Texturing a pie put two of four wedges
 * at full density and left a third empty — two solid wedges, one of them the
 * one the reader was standing on, and no way to tell which.
 */
const COLOUR_IS_THE_VALUE: ReadonlySet<string> = new Set([
  'heat',
  'choropleth',
  'hexbin',
]);

/**
 * Trace types where whether the chart filled a mark is itself the reading.
 *
 * A candlestick says which way the day went by drawing the body solid or
 * hollow, and nothing else about the body carries it: a falling day and a
 * rising day of the same range are the same rectangle in the same place. So an
 * outline-only display drops the one thing the chart was drawing the body to
 * say.
 *
 * Only the direction, not a scale. The bodies come back as two groups and the
 * darker one is the one the chart drew solid, whether that is black against
 * white or red against green.
 */
const FILL_IS_THE_DIRECTION: ReadonlySet<string> = new Set([
  'candlestick',
]);

/**
 * How much of a solid-drawn body to raise.
 *
 * Half. The focused mark is the only thing on the display that is solid, and it
 * has to stay that way — a texture at four fifths is a filled mark with a
 * blemish, and the reader loses where they are standing. Half reads as a
 * distinctly coarse field under a fingertip and cannot be mistaken for solid.
 */
const SOLID_BODY_DENSITY = 0.5;

/**
 * How much darker than the lightest body a body has to be to count as one the
 * chart filled.
 *
 * Enough to ignore the difference an anti-aliased edge or a fill-opacity makes,
 * and far below the distance between any two colours a chart would pick to mean
 * opposite things.
 */
const SOLID_BODY_CONTRAST = 0.15;

/**
 * How thin a mark has to be, in screen pixels, to be a stroke rather than a
 * body.
 *
 * A candlestick's wicks arrive in the same list as its bodies and are always
 * unpainted, being lines. Reading them as unpainted *bodies* would put a hollow
 * one in every chart and make the lightest-is-hollow comparison say the same
 * thing about every chart, whatever it drew. They have no interior to texture
 * either, so nothing is lost by leaving them out of the question entirely.
 */
const HAIRLINE_SPAN = 1;

/**
 * Trace types read by their shape, where the chart's own proportions have to
 * survive the mapping onto the pins.
 */
const SHAPE_IS_THE_DATA: ReadonlySet<string> = new Set([
  'pie',
  'polar_area',
  'radar',
  'sunburst',
  'gauge',
  'chord',
  'choropleth',
  'network',
  'hexbin',
]);

// Every one of these reads by angle or by outline. A treemap and an icicle
// draw the same tree a sunburst does and are deliberately *not* here: they
// encode value as rectangle area, and area survives an uneven stretch intact.
// Scaling x by `a` and y by `b` multiplies every area by `ab`, so two tiles
// that matched before still match after — a 4x1 and a 1x4 both come out at 12
// under a 3x horizontal stretch. An angle does not survive it: the 45 degrees
// that divides a pie in eighths arrives as 18. Letterboxing a treemap would
// spend pins to protect something that was never at risk.

/**
 * Draws the focused chart onto a connected tactile display, and puts the
 * focused point's description on its braille text line.
 *
 * The display mirrors braille mode: it comes up when the reader turns braille
 * on and goes down when they turn it off, so there is one mental switch for
 * "show me this by touch" rather than two.
 *
 * The chart is drawn by scaling its own SVG geometry down onto the pin grid —
 * marks outlined, the focused mark filled. At the sizes involved a whole chart
 * often collapses into a few pins, which is why the view zooms: each zoom step
 * spends the same pins on a smaller slice of the chart, and panning reaches the
 * rest.
 */
export class TactileService implements Observer<TactileStateUnion>, Disposable {
  /**
   * Said when zoom or pan is asked for before anything has been drawn — the
   * chart has no measurable region, or no navigation has happened yet. Every
   * other refusal in this service explains itself; falling silent here would
   * leave the reader pressing a key that does nothing for no stated reason.
   */
  private static readonly NO_VIEW = 'Nothing is on the tactile display yet';

  private readonly display: DisplayService;
  private readonly notification: NotificationService;
  private readonly text: TextService;

  private figure: Figure;

  /**
   * Whether the reader has asked for the display, independently of whether
   * braille itself could be encoded. See {@link toggle}.
   */
  private showing = false;

  /**
   * Zoom and pan over the chart. Rebuilt when the chart region changes size.
   */
  private viewport: TactileViewport | null = null;

  /**
   * How the current viewport treats the chart's proportions, so a move onto a
   * trace that wants the other mode rebuilds it.
   */
  private aspect: TactileAspect = 'stretch';

  /**
   * The frame currently on the device, so only changed rows are re-sent.
   */
  private lastRaster: DotRaster | null = null;

  /**
   * The most recent trace state, so zoom and pan can redraw without waiting for
   * the reader to navigate.
   */
  private lastState: DrawableState | null = null;

  /**
   * Proactive repairs made since the reader last did anything.
   *
   * A repair is itself a write and can fail in turn, so healing a dead
   * connection by redrawing would retry forever. Reader activity is what
   * resets this, which makes the bound the right shape: a display that broke
   * mid-session is repaired at once, and one that cannot be written to at all
   * stops being written to until the reader asks for something new.
   *
   * A device connecting and a new figure reset it too. Neither is the reader
   * moving, but both replace the thing the budget was spent on -- carrying a
   * used-up budget onto a display that has only just arrived would leave the
   * first failure on it unrepaired for no reason.
   */
  private repairAttempts = 0;

  /**
   * Most proactive repairs between reader actions.
   */
  private static readonly MAX_REPAIR_ATTEMPTS = 2;

  /**
   * Whether the reader has been told the text line is uncontracted, so they
   * are told once rather than on every move.
   */
  private warnedUncontracted = false;

  /**
   * The payload currently on the braille text line, so an unchanged value is
   * not retransmitted. Writes share one serialised queue with the graphic
   * frames, so a redundant text write sits ahead of the next real frame and
   * costs the reader latency.
   */
  private lastText: string | null = null;

  /**
   * The full description of the focused point, translated to braille cells.
   * Kept whole so the reader can scroll along a line that runs past the
   * device's width.
   */
  private textCells: number[] = [];

  /**
   * Which slice of {@link textCells} is on the line.
   */
  private textWindow = 0;

  /**
   * Counts translation requests so a slow one cannot overwrite the line with
   * the description of a point the reader has already moved off.
   */
  private textRequest = 0;

  /**
   * The chart's drawable shapes, and the region they were collected from.
   *
   * Walking the SVG and measuring every shape costs a layout pass, and this
   * runs on every arrow key. The chart's own geometry does not change as the
   * reader navigates — only which mark is focused — so the walk is done once
   * per chart and reused. It is redone whenever the chart could have changed
   * underneath: a new figure, the display being switched on, or a device
   * connecting.
   */
  /**
   * True once this service has been torn down.
   *
   * The controller is disposed on focus-out, which is a 0ms timer, while
   * taking up a display is a network round trip — so a reader who presses `b`
   * and tabs away can easily have a newer controller running in this frame by
   * the time the old adoption resolves. Both share the one session, so acting
   * on that stale result would reach past this service and disturb a live one.
   */
  private disposed = false;

  private shapeCache: {
    region: Element;
    subplot: Subplot;
    trace: Trace | null;
    /**
     * The active layer's marks, which are what gets drawn.
     */
    shapes: SVGGraphicsElement[];
    /**
     * Every layer's marks, which are what the window is sized to. Held as
     * elements rather than as a rectangle: the chart moves when the page
     * scrolls or resizes, so the bounds have to be re-read each frame even
     * though the elements they belong to have not changed.
     */
    allLayers: SVGGraphicsElement[];
  } | null = null;

  private readonly disposables: Disposable[] = [];

  /**
   * @param display - Provides the chart's DOM root
   * @param braille - Supplies the braille on/off state this display mirrors
   * @param notification - Announces zoom, pan and connection changes
   * @param text - Formats the description the braille text line carries
   * @param figure - The figure being displayed, for locating the active subplot
   */
  public constructor(
    display: DisplayService,
    braille: BrailleService,
    notification: NotificationService,
    text: TextService,
    figure: Figure,
  ) {
    this.display = display;
    this.notification = notification;
    this.text = text;
    this.figure = figure;

    // Braille turning on or off carries the display with it, which is the
    // one-switch behaviour the reader is told about. It is a follower, not the
    // gate: see {@link toggle}.
    this.disposables.push(braille.onToggle((event) => {
      this.setShowing(event.enabled);
    }));

    this.disposables.push(dotPadSession.onKey((key) => {
      this.handleDeviceKey(key);
    }));

    this.disposables.push(dotPadSession.onWriteFailure(() => {
      this.handleWriteFailure();
    }));

    this.disposables.push(dotPadSession.onStateChange((state) => {
      if (state.status === 'connected') {
        this.lastRaster = null;
        this.lastText = null;
        this.shapeCache = null;
        // TEMPORARILY DISABLED FOR DISCRIMINATION CHECK
        // A display that has just arrived gets the repair budget back, even if
        // the one before it used the budget up on its way out. The bound
        // exists to stop a device that cannot be written to from being written
        // to forever, and a device that has just connected is not that device
        // -- and until the reader navigates, nothing else would restore it.
        this.repairAttempts = 0;
        // Rebuilt rather than kept: a different device reports a different pin
        // count, and a viewport still mapped to the old grid would quietly
        // drop everything past the new one's edge.
        this.viewport = null;
        this.refresh();
      }
    }));
  }

  /**
   * Points the service at a new figure after a live-data swap.
   * @param figure - The replacement figure
   */
  public setFigure(figure: Figure): void {
    this.figure = figure;
    this.viewport = null;
    this.lastRaster = null;
    this.lastText = null;
    this.repairAttempts = 0;
    this.textCells = [];
    this.textWindow = 0;
    this.textRequest++;
    this.shapeCache = null;
  }

  /**
   * True when the display should currently be showing something: braille is on
   * and a device is connected.
   */
  public get isActive(): boolean {
    return this.showing && dotPadSession.isConnected;
  }

  /**
   * Whether a display is there to be shown anything.
   *
   * The key handler asks before taking `b` over from braille: with no device
   * connected there is nothing to offer, and the reader is better served by
   * braille's own account of why it cannot open.
   */
  public get canShow(): boolean {
    return dotPadSession.isConnected;
  }

  /**
   * Turns the display on or off at the reader's request.
   *
   * `b` is the one switch for "show me this by touch", and braille normally
   * carries the display with it. But braille has to encode the data, and there
   * are places it cannot: the multi-panel lobby, where no series is selected
   * yet, and the plot types with no braille table -- scatter, manhattan,
   * volcano. Gating the pins on that made the display unreachable in exactly
   * those places, and a scatter is the chart a pin grid draws best of all: a
   * cloud of points is what the grid natively is.
   *
   * So this exists to be called where braille declines, and the display comes
   * up on the chart's own geometry, which never needed a braille table.
   */
  public toggle(): void {
    this.setShowing(!this.showing);
  }

  /**
   * Raises or lowers the whole display.
   * @param next - True to show the chart, false to lower every pin
   */
  private setShowing(next: boolean): void {
    if (next === this.showing) {
      return;
    }
    this.showing = next;

    if (!next) {
      this.blank();
      // Handed back so the next chart can take it. Only if it was adopted:
      // a display the reader connected here on purpose stays here.
      dotPadSession.releaseIfAdopted();
      return;
    }

    this.viewport?.reset();
    this.shapeCache = null;
    // Every chart in a notebook is its own iframe and so its own connection,
    // but the permission behind it belongs to the page. Taking the display up
    // here — silently, no picker — is what makes the reader pair once for the
    // page rather than once for every chart.
    if (!dotPadSession.isConnected) {
      void dotPadSession.adopt().then((adopted) => {
        if (!adopted) {
          return;
        }
        // The display may have gone off again while this was in flight — a
        // double press of `b` is enough. The release on the way out found
        // nothing to release, because the adoption had not happened yet, so it
        // has to happen here instead: otherwise the display stays checked out
        // to a chart whose panel is shut, and the next chart to want it finds
        // the device already open and gives up quietly. A newer controller may
        // own this frame by now — focus-out disposes on a 0ms timer and this
        // took a round trip. It shares the same session, so handing the device
        // back here would take it from a chart that is using it.
        if (this.disposed) {
          return;
        }
        if (this.showing) {
          this.refresh();
        } else {
          dotPadSession.releaseIfAdopted();
        }
      });
    }
    this.refresh();
  }

  /**
   * Receives every navigation move.
   * @param state - The new figure, subplot or trace state
   */
  public update(state: TactileStateUnion): void {
    // Figure states as well as trace states. In a multi-panel plot the reader
    // arrives at the lobby first and moves between panels there, and without
    // this the pins keep whatever chart was last drawn — a panel they may have
    // left, presented as though it were the one under the cursor.
    if (state.empty || (state.type !== 'trace' && state.type !== 'figure')) {
      return;
    }
    this.lastState = state;
    this.repairAttempts = 0;
    if (!this.isActive) {
      return;
    }

    try {
      this.draw(state, true);
    } catch (error) {
      // A hardware or geometry failure must not break the navigation the
      // reader is in the middle of; the audio and text channels carry on.
      console.error('Tactile render failed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Redraws from the last known state, for changes that did not come from a
   * navigation move — a zoom step, a pan, or the device connecting.
   */
  public refresh(): void {
    this.redraw(true);
  }

  /**
   * Redraws from the last known state.
   * @param followFocus - Whether a focus outside the view should recentre it;
   * false for a redraw the reader asked for by panning or zooming
   * @returns True when the frame that reached the pins differed from the one
   * already there
   */
  private redraw(followFocus: boolean): FrameOutcome {
    const state = this.lastState;
    if (state === null || !this.isActive) {
      return 'unchanged';
    }
    try {
      return this.draw(state, followFocus);
    } catch (error) {
      console.error('Tactile render failed:', error instanceof Error ? error.message : error);
      return 'unchanged';
    }
  }

  /**
   * Zooms the tactile view in one step.
   */
  public zoomIn(): void {
    this.changeZoom(viewport => viewport.zoomIn(), 'Already at the closest zoom');
  }

  /**
   * Zooms the tactile view out one step.
   */
  public zoomOut(): void {
    this.changeZoom(viewport => viewport.zoomOut(), 'Already showing the whole plot');
  }

  /**
   * Applies a zoom step and announces the result.
   * @param step - The zoom operation, returning whether it changed anything
   * @param refusal - What to say when the zoom is already at that limit
   */
  private changeZoom(step: (viewport: TactileViewport) => boolean, refusal: string): void {
    if (!this.requireActive()) {
      return;
    }
    const viewport = this.viewport;
    if (viewport === null) {
      this.notification.notify(TactileService.NO_VIEW);
      return;
    }
    if (!step(viewport)) {
      this.notification.notify(refusal);
      return;
    }
    // Follows the focus, unlike a pan. Zoom is asked for to feel one mark more
    // closely, and the mark meant is the one the reader is on -- so the window
    // has to close in on that rather than on the middle of the plot, which is
    // where it would otherwise stay. Two steps in, the middle of a plot is
    // usually a patch with nothing in it, and the reader who zoomed to feel
    // their point in more detail gets a blank display and no way to tell that
    // their point is simply somewhere off the edge of it.
    this.announceView(viewport, this.redraw(true));
  }

  /**
   * Pans the tactile view one step.
   * @param direction - Which way to move the view over the chart
   */
  public pan(direction: PanDirection): void {
    if (!this.requireActive()) {
      return;
    }
    const viewport = this.viewport;
    if (viewport === null) {
      this.notification.notify(TactileService.NO_VIEW);
      return;
    }
    if (!viewport.pan(direction)) {
      this.notification.notify(viewport.isWholePlotVisible
        ? 'The whole plot is already shown; zoom in to pan'
        : `No more to show to the ${direction}`);
      return;
    }
    this.announceView(viewport, this.redraw(false));
  }

  /**
   * Says where the view now sits, and whether the pins moved with it.
   *
   * A window that lands somewhere featureless -- inside a bar's fill, or on a
   * stretch of chart with no mark in it -- redraws to the same frame it
   * replaced. The reader's fingers then find exactly what they found before,
   * which is indistinguishable from a key that did nothing, and the honest
   * thing is to say which of the two it was rather than leave them pressing it
   * again. This is the common case at close zoom, not an edge case: past a few
   * steps in, a window is often entirely inside one mark.
   *
   * A window holding nothing at all gets its own wording. Every pin down is
   * also what a display that has stopped working feels like, so silence there
   * would leave the reader unable to tell an empty patch of chart from a dead
   * device.
   *
   * @param viewport - The viewport that just moved
   * @param outcome - What the redraw did to the pins
   */
  private announceView(viewport: TactileViewport, outcome: FrameOutcome): void {
    const suffix = outcome === 'empty'
      ? '; nothing is in view'
      : (outcome === 'unchanged' ? '; the pins are unchanged' : '');
    this.notification.notify(`${viewport.describe()}${suffix}`);
  }

  /**
   * Reports whether the display can act, telling the reader why when it cannot.
   */
  private requireActive(): boolean {
    if (this.isActive) {
      return true;
    }
    this.notification.notify(dotPadSession.isConnected
      ? 'Turn braille on to use the tactile display'
      : 'No tactile display is connected');
    return false;
  }

  /**
   * Routes a hardware key press.
   * @param key - The key the device reported
   */
  private handleDeviceKey(key: DotPadKey): void {
    if (!this.isActive) {
      return;
    }

    const direction = KEY_PAN[key];
    if (direction !== undefined) {
      this.pan(direction);
      return;
    }

    const step = KEY_TEXT_SCROLL[key];
    if (step !== undefined) {
      this.scrollText(step);
    }
  }

  /**
   * Moves along the braille text line by one window.
   *
   * The device reports its keys but never scrolls its own buffer, so each
   * window is re-sent from the first cell of the line.
   *
   * @param step - Windows to move; negative moves back toward the start
   */
  public scrollText(step: number): void {
    const cellCount = dotPadSession.geometry?.textCells ?? 0;
    if (!this.isActive || cellCount <= 0) {
      return;
    }

    const lastWindow = TactileBraille.windowCount(this.textCells, cellCount) - 1;
    if (lastWindow <= 0) {
      this.notification.notify('The whole line is already shown');
      return;
    }

    const next = Math.min(Math.max(this.textWindow + step, 0), lastWindow);
    if (next === this.textWindow) {
      this.notification.notify(step < 0 ? 'Start of the line' : 'End of the line');
      return;
    }

    this.textWindow = next;
    this.writeTextWindow(cellCount);
    this.notification.notify(`Line part ${next + 1} of ${lastWindow + 1}`);
  }

  /**
   * The root SVG of the chart, or null when it cannot be found.
   */
  private findSvg(): SVGSVGElement | null {
    return this.display.plot.querySelector('svg');
  }

  /**
   * The element whose bounds define the region mapped onto the pins.
   *
   * The active subplot's axes group is preferred, because it excludes the
   * chart's margins and so spends every pin on data. It is resolved only for
   * charts that expose one, so the whole SVG is the fallback.
   */
  private findRegionElement(): SVGGraphicsElement | null {
    const axes = this.figure.activeSubplot.axesElement;
    if (axes !== null) {
      return axes as SVGGraphicsElement;
    }
    return this.findSvg();
  }

  /**
   * Reads an element's bounds as a plain rectangle.
   * @param element - The element to measure
   */
  private static rectOf(element: Element): ClientRect | null {
    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) {
      return null;
    }
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  }

  /**
   * Collects the chart's own drawable shapes.
   *
   * Groups are walked to their leaves so each shape is transformed by its own
   * matrix, and MAIDR's injected geometry — hidden highlight clones, the visual
   * highlight overlay — is left out so the tactile view shows the chart rather
   * than a doubled copy of it. The panel the chart sits in goes too, since the
   * background and the spines cost more pins here than the marks do.
   *
   * Only this path sifts. A mark the model hands over is data whatever it looks
   * like, so nothing is dropped from that list.
   *
   * @param root - The element to walk
   * @returns Leaf shapes in document order
   */
  private static collectShapes(root: Element): SVGGraphicsElement[] {
    const shapes: SVGGraphicsElement[] = [];

    const walk = (element: Element): void => {
      for (const child of Array.from(element.children)) {
        if (!TactileSvgGeometry.isRenderable(child)) {
          continue;
        }
        const tag = child.tagName.toLowerCase();
        if (tag === 'g' || tag === 'svg' || tag === 'a') {
          walk(child);
          continue;
        }
        shapes.push(child as SVGGraphicsElement);
      }
    };

    walk(root);
    return TactileSvgGeometry.withoutPanel(shapes);
  }

  /**
   * The data marks of every trace in the active subplot.
   *
   * Asked of the model rather than found in the DOM. The model already knows
   * which elements are data — that is what it highlights — so taking the list
   * from there draws the chart and nothing else: no axis spines, no tick marks,
   * no plot background, no title. Sifting the axes subtree for the same answer
   * would mean guessing at each library's markup, and guessing wrong either
   * leaves furniture on the pins or drops a mark.
   */
  private static traceShapes(trace: Trace): SVGGraphicsElement[] {
    // `getAllHighlightElements`, not `getAllOriginalElements`. The latter
    // reaches an element's `previousElementSibling`, which is only the mark
    // for traces whose highlight values are hidden clones inserted after it.
    // Twenty call sites across box, heatmap, line, violin and bar select with
    // `shouldClone: false` and hold the live element itself, and there the
    // sibling is the neighbouring mark: the list comes back shifted by one,
    // the last mark missing and something that is not a mark drawn in its
    // place — silently, on exactly the trace types whose marks are hardest to
    // count by touch.
    //
    // Not filtered through `isRenderable` either. These are the model's own
    // data elements, so there is nothing to sift out, and a clone would fail
    // that test on both counts: it is MAIDR-owned and it is hidden. Hidden is
    // no obstacle to measuring one — `visibility: hidden` still takes part in
    // layout, and the clone sits at its original's geometry.
    //
    // A trace that draws a shape its highlight markers only sit on is asked for
    // that shape first. A line is the case that matters: maidr synthesises one
    // circle per vertex out of the rendered `<path>`, so the highlight list is
    // the points and never the line between them. Drawn from those alone the
    // display shows a scatter of dots where the chart shows a line -- and
    // zoomed in, a window landing between two vertices holds nothing at all,
    // so every pan from there redraws the same empty frame and the panning keys
    // feel dead. The path is one element covering the whole series, so it is
    // still there at any zoom the reader picks.
    const geometry = trace.getGeometryElements?.() ?? [];
    if (geometry.length > 0) {
      return geometry as SVGGraphicsElement[];
    }

    return trace.getAllHighlightElements() as SVGGraphicsElement[];
  }

  /**
   * The marks of the layer the reader is on.
   *
   * One layer, not the subplot's whole stack. Sixty pins across cannot hold
   * three overlaid series and still be read — they land on each other and the
   * result is a smear no fingertip can take apart. It would also make the
   * layer keys do nothing a reader could feel: PageUp would move the focus
   * from one series to another while the picture under their hand stayed
   * exactly as it was.
   */
  private modelShapes(): SVGGraphicsElement[] {
    const trace = this.figure.activeSubplot.activeTrace;
    return trace === null ? [] : TactileService.traceShapes(trace);
  }

  /**
   * The marks of every layer in the subplot.
   *
   * The window is sized to all of them even though only one is drawn, so that
   * changing layer changes which marks are on the pins and nothing else. Scale
   * the drawn layer to fill the grid instead and a series running 0 to 2 would
   * come out the same height as one running 0 to 20 — the layers stop being
   * comparable at the exact moment the reader switches between them to compare
   * them.
   */
  private allLayerShapes(): SVGGraphicsElement[] {
    const shapes: SVGGraphicsElement[] = [];
    for (const row of this.figure.activeSubplot.traces) {
      for (const trace of row) {
        shapes.push(...TactileService.traceShapes(trace));
      }
    }
    return shapes;
  }

  /**
   * The chart's shapes, collected once per region and reused.
   *
   * Falls back to walking the region's subtree when the model has no elements
   * to give — a trace authored without selectors has none. That path draws
   * whatever the chart drew, minus the axis furniture
   * {@link TactileSvgGeometry.isRenderable} can name, which is the best that
   * can be done without knowing which shapes are the data.
   *
   * @param region - The element whose subtree holds the chart
   */
  private shapesOf(region: Element): { shapes: SVGGraphicsElement[]; allLayers: SVGGraphicsElement[] } {
    // Keyed on the active trace, not just the region: a layer switch keeps the
    // same region and the same subplot, so a region-keyed cache hands back the
    // outgoing layer's marks and the display never changes. Keyed on the
    // subplot too, since a figure whose subplots expose no axes element gives
    // every one of them the same region and the same null trace.
    const subplot = this.figure.activeSubplot;
    const trace = subplot.activeTrace;
    if (this.shapeCache !== null
      && this.shapeCache.region === region
      && this.shapeCache.subplot === subplot
      && this.shapeCache.trace === trace) {
      return this.shapeCache;
    }
    const fromModel = this.modelShapes();
    const shapes = fromModel.length > 0 ? fromModel : TactileService.collectShapes(region);
    const allLayers = fromModel.length > 0 ? this.allLayerShapes() : shapes;
    this.shapeCache = { region, subplot, trace, shapes, allLayers };
    return this.shapeCache;
  }

  /**
   * Whether this chart's own proportions have to survive the mapping.
   *
   * The lobby stretches: a panel is a rectangle of chart, and which trace type
   * is inside it is not settled until the reader enters one.
   *
   * @param state - The state about to be drawn
   */
  private static aspectFor(state: DrawableState): TactileAspect {
    if (state.type !== 'trace') {
      return 'stretch';
    }
    return SHAPE_IS_THE_DATA.has(state.traceType) ? 'preserve' : 'stretch';
  }

  /**
   * How much of each mark's interior to raise, where the chart put a value in
   * its fill colour rather than in its shape.
   *
   * A heatmap, a choropleth, a hexbin and a mosaic draw every cell the same
   * size and shape, so the geometry that reaches the pins is a lattice and
   * nothing else — 819 pins spent on an 8x8 grid, measured, delivering none of
   * its 64 values. Density is the one substitute a hand can read.
   *
   * A candlestick is the other case, and a different one: there the fill is not
   * a quantity but a direction, so its bodies are textured at one density
   * rather than graded. See {@link solidBodyShades}.
   *
   * Empty when fill is decoration rather than data. `densities` decides that
   * from the spread of the colours themselves, so a bar chart whose bars are
   * all one blue keeps its hollow interiors and the solid focused mark stays
   * the only solid thing on the display.
   *
   * @param marks - The marks about to be drawn
   * @param state - The state being drawn, which says what its colours mean
   */
  private static shadesOf(
    marks: readonly SVGGraphicsElement[],
    state: DrawableState,
  ): Map<SVGGraphicsElement, number> | undefined {
    if (marks.length < 2 || typeof window === 'undefined' || state.type !== 'trace') {
      return undefined;
    }
    if (FILL_IS_THE_DIRECTION.has(state.traceType)) {
      return TactileService.solidBodyShades(marks);
    }
    if (!COLOUR_IS_THE_VALUE.has(state.traceType)) {
      return undefined;
    }

    const densities = TactileShade.densities(marks.map(mark => TactileService.fillOf(mark)));
    if (densities === null) {
      return undefined;
    }

    const shades = new Map<SVGGraphicsElement, number>();
    densities.forEach((density, index) => {
      if (density !== null) {
        shades.set(marks[index], density);
      }
    });
    return shades.size > 0 ? shades : undefined;
  }

  /**
   * The fill the chart painted a mark with, or null when it painted none.
   * @param mark - The element to read
   */
  private static fillOf(mark: SVGGraphicsElement): string | null {
    try {
      return window.getComputedStyle(mark).fill || mark.getAttribute('fill');
    } catch {
      return null;
    }
  }

  /**
   * Textures the marks the chart drew solid, on a chart where that is the
   * reading rather than decoration.
   *
   * Which group is which comes from the chart, not from a convention: the
   * lightest body is taken as the hollow one, and everything meaningfully
   * darker than it is one the chart filled. That holds for a candlestick drawn
   * black against white, for one drawn red against green, and for the hollow
   * convention where the rising bodies are `fill: none` and only the falling
   * ones are painted — an unpainted body counts as the lightest thing there is,
   * because what shows through it is the panel.
   *
   * Wicks are left out. They arrive in the same list, they are always unpainted
   * being lines, and counting them as hollow bodies would put one in every
   * chart — the comparison would then say the same thing about every chart
   * whatever it drew.
   *
   * Nothing is textured when the marks share a single fill. There is no
   * direction being drawn then, and texturing every body would leave the
   * focused one as the only solid mark among a display of near-solid ones.
   *
   * @param marks - The marks about to be drawn
   */
  private static solidBodyShades(
    marks: readonly SVGGraphicsElement[],
  ): Map<SVGGraphicsElement, number> | undefined {
    const lightness = marks.map((mark) => {
      const box = mark.getBoundingClientRect();
      if (box.width <= HAIRLINE_SPAN || box.height <= HAIRLINE_SPAN) {
        return null;
      }
      const fill = TactileService.fillOf(mark);
      if (fill === null) {
        return null;
      }
      // An unpainted body is not a body without a colour, it is one the chart
      // drew hollow — the panel shows through it, which is as light as anything
      // on the chart gets. Leaving it out of the comparison instead is what
      // broke the hollow-candle convention, where the rising bodies carry
      // `fill: none` and only the falling ones are painted: the painted ones
      // were then the only measured group, every one of them as light as the
      // lightest, and the display fell back to outlines with no direction on it
      // at all.
      return TactileShade.luminanceOf(fill) ?? 1;
    });

    let lightest: number | null = null;
    for (const value of lightness) {
      if (value !== null && (lightest === null || value > lightest)) {
        lightest = value;
      }
    }
    if (lightest === null) {
      return undefined;
    }

    const shades = new Map<SVGGraphicsElement, number>();
    lightness.forEach((value, index) => {
      if (value !== null && lightest - value > SOLID_BODY_CONTRAST) {
        shades.set(marks[index], SOLID_BODY_DENSITY);
      }
    });
    return shades.size > 0 ? shades : undefined;
  }

  /**
   * Normalizes a highlight state to a list of elements.
   * @param highlight - The highlight state from a trace
   */
  private static focusedElements(highlight: HighlightState): SVGGraphicsElement[] {
    if (highlight.empty) {
      return [];
    }
    const elements = Array.isArray(highlight.elements) ? highlight.elements : [highlight.elements];
    return elements as SVGGraphicsElement[];
  }

  /**
   * Combined bounds of the focused elements, for deciding whether the view
   * still shows them.
   * @param elements - The focused elements
   */
  private static boundsOf(elements: readonly SVGGraphicsElement[]): ClientRect | null {
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const element of elements) {
      const box = element.getBoundingClientRect();
      // An element with no box at all is not somewhere the chart reaches. A
      // stylesheet can hide one in ways the attribute checks do not see, and
      // an unrendered element reports a zero rect at the viewport origin —
      // which, folded into the extent, drags the window off to the top-left
      // corner and shrinks every real mark to nothing.
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }

    if (!Number.isFinite(left)) {
      return null;
    }
    return { left, top, width: right - left, height: bottom - top };
  }

  /**
   * Renders the current state and sends it to the device.
   * @param state - The trace state to draw
   * @param followFocus - Whether a focus outside the view should recentre it
   * @returns True when the frame differed from the one already on the device
   */
  private draw(state: DrawableState, followFocus: boolean): FrameOutcome {
    const geometry = dotPadSession.geometry;
    const region = this.findRegionElement();
    if (geometry === null || region === null) {
      return 'unchanged';
    }

    const { shapes: marks, allLayers } = this.shapesOf(region);

    // The window is the marks' own extent, not the plot region's. The region
    // carries tick labels, the axis spines and the title, and giving those pins
    // spends a fifth of the display on things this renderer does not draw. A
    // grid this small has no pins to spare for margins.
    //
    // Unless that extent is flat: a trace whose values are all equal has marks
    // sharing a line with no height at all, and there is no window to be drawn
    // in. The region is what gives one back.
    const markBounds = TactileService.boundsOf(allLayers);
    const source = markBounds !== null && markBounds.width > 0 && markBounds.height > 0
      ? markBounds
      : TactileService.rectOf(region);
    if (source === null) {
      return 'unchanged';
    }

    const aspect = TactileService.aspectFor(state);
    if (this.viewport === null || this.aspect !== aspect) {
      // Rebuilt rather than adjusted when the mode changes: a layer switch can
      // move between a shape chart and an ordinary one, and the two map the
      // same rect onto different pins.
      this.viewport = new TactileViewport(source, geometry.dotWidth, geometry.dotHeight, aspect);
      this.aspect = aspect;
    } else {
      this.viewport.setSource(source);
    }

    // The lobby has no focused mark: its highlight is the whole panel, and
    // filling that would raise every pin the panel covers. Its marks are drawn
    // as outlines and nothing is solid, which is the truth — the reader has not
    // chosen a point yet.
    const focused = state.type === 'trace'
      ? TactileService.focusedElements(state.highlight)
      : [];

    // Follow the focus when a navigation move or a zoom step took it off the
    // view, and never on the redraw a pan asks for. Panning is what moves the
    // focus out of view deliberately, so recentring there would undo the
    // reader's own pan on the very redraw it triggered — and for a mark bigger
    // than the window, which can never be contained, panning would never move
    // at all while still announcing that it had.
    if (followFocus) {
      const focusBounds = TactileService.boundsOf(focused);
      if (focusBounds !== null && !this.viewport.containsRect(focusBounds)) {
        this.viewport.centreOn(focusBounds);
      }
    }

    // The renderer pairs the two lists by object identity, so a mark that is
    // also the focus is drawn once, filled, rather than outlined and then
    // filled over. That pairing does its work where both lists come from the
    // same place -- a bar, a point, a box, whose highlight values are the marks
    // themselves.
    //
    // Where they do not, it is a no-op rather than a fault. A line's marks are
    // its rendered path and its focus is the synthesised circle on one vertex
    // of that path: no element is in both, so the path is outlined and the
    // circle filled, which is the picture wanted anyway -- a line you can trace
    // with one raised dot where you are standing on it.
    const scene: TactileScene = { marks, focused, shades: TactileService.shadesOf(marks, state) };

    const raster = TactileRenderer.render(
      scene,
      this.viewport,
      geometry.dotWidth,
      geometry.dotHeight,
    );

    const changed = this.send(raster, geometry.cellColumns, geometry.cellRows);
    this.sendText(state, geometry.textCells);
    if (raster.raisedCount === 0) {
      return 'empty';
    }
    return changed ? 'changed' : 'unchanged';
  }

  /**
   * Rebuilds what this service believes the device is showing, after a write
   * that did not land.
   *
   * Only the rows that changed are transmitted, which means every frame is a
   * difference against the frame before it. That is worth a second or more of
   * the reader's time per move, and it is correct exactly while the device
   * received everything sent to it. A dropped write breaks that: the rows it
   * carried keep whatever they held, and because the next frame is a
   * difference against what was *sent* rather than what *arrived*, those rows
   * are never named again. The display stays wrong in a few places -- a
   * fragment of an older frame among the current one -- and navigating does
   * not clear it, because navigating only ever sends differences.
   *
   * Worse, an unchanged frame is skipped entirely, so returning the view to
   * where it started -- zooming in and back out -- transmits nothing at all.
   * That is the one moment the reader is most certain of what they should be
   * feeling, and it was the moment least able to repair itself.
   *
   * Forgetting the frame is what fixes both: with nothing to difference
   * against, the next write is a whole frame, which is true whatever the
   * device is currently holding. The text line is forgotten for the same
   * reason -- it is cached against retransmission in exactly the same way.
   */
  private handleWriteFailure(): void {
    this.lastRaster = null;
    this.lastText = null;
    if (!this.isActive || this.repairAttempts >= TactileService.MAX_REPAIR_ATTEMPTS) {
      return;
    }
    this.repairAttempts++;
    // After the failing write has left the queue, so the repair is not chained
    // behind the state that provoked it.
    queueMicrotask(() => {
      if (this.disposed || !this.isActive) {
        return;
      }
      this.redraw(false);
    });
  }

  /**
   * Sends a frame, transmitting only the cell rows that changed.
   *
   * A full frame costs the device a second or more, and the reader is pressing
   * arrow keys faster than that, so a move that changes two rows must send two
   * rows.
   *
   * @param raster - The frame to display
   * @param cellColumns - Cells across the device
   * @param cellRows - Cells down the device
   * @returns True when the frame differed from the one already on the device
   */
  private send(raster: DotRaster, cellColumns: number, cellRows: number): boolean {
    const previous = this.lastRaster;
    if (previous !== null && previous.equals(raster)) {
      return false;
    }

    if (previous === null) {
      dotPadSession.writeGraphic(DotPack.graphic(raster, cellColumns, cellRows));
    } else {
      const changed = DotPack.changedRows(previous, raster, cellRows);
      if (changed.length > cellRows / 2) {
        dotPadSession.writeGraphic(DotPack.graphic(raster, cellColumns, cellRows));
      } else {
        for (const cellRow of changed) {
          dotPadSession.writeGraphicRow(cellRow, DotPack.graphicRow(raster, cellRow, cellColumns));
        }
      }
    }

    this.lastRaster = raster;
    return true;
  }

  /**
   * Tells the reader once that the text line is uncontracted.
   *
   * Grade 2 is what a fluent reader reads, and on twenty cells the
   * contractions are most of the difference between a value fitting and having
   * to be panned for -- so a line that quietly arrives uncontracted is not a
   * cosmetic downgrade, and it looks exactly like a line that was always going
   * to be that long. There is nothing in the cells themselves that says which
   * of the two happened.
   *
   * Both ways it can happen are covered, which matters because they are not the
   * same failure. The engine can be unreachable, and it can also come up,
   * accept a language and a grade, and then return nothing when asked to
   * translate -- a broken table compiles to an empty result rather than to an
   * error, and that path leaves {@link DotPadSession.canTranslate} true.
   *
   * Once per session. It is a standing condition, not an event, and repeating
   * it on every arrow key would talk over the reading it is describing.
   */
  private announceUncontracted(): void {
    if (this.warnedUncontracted) {
      return;
    }
    this.warnedUncontracted = true;
    this.notification.notify(
      'Contracted braille is unavailable, so the tactile display\'s text line is uncontracted',
    );
  }

  /**
   * Puts the focused point's description on the braille text line.
   *
   * The description is the same one review mode reads out, verbatim — one
   * account of the focused point rather than a separate abbreviated phrasing
   * for the device, so what a reader meets under their fingers matches what
   * they hear and what review shows.
   *
   * It runs well past twenty cells, so only the first window goes out and the
   * reader scrolls the rest with the device's outer function keys.
   *
   * @param state - The focused trace state
   * @param cellCount - Cells on the device's text line
   */
  private sendText(state: DrawableState, cellCount: number): void {
    if (cellCount <= 0) {
      return;
    }

    const description = this.text.format(state);
    // Back to the start on every move: the line now describes a different
    // point, and leaving the window where it was would drop the reader into
    // the middle of a sentence they have not read the beginning of.
    this.textWindow = 0;
    const request = ++this.textRequest;

    if (!dotPadSession.canTranslate) {
      this.announceUncontracted();
      this.textCells = TactileBraille.toCells(description);
      this.writeTextWindow(cellCount);
      return;
    }

    // Contracted braille comes from the device's own engine, so nothing is
    // written until it answers. The wait is a few milliseconds against a
    // graphic frame that costs a second, and writing uncontracted cells first
    // would spend a device write on a line about to be replaced.
    void dotPadSession.translate(description).then((hex) => {
      if (request !== this.textRequest) {
        return;
      }
      if (hex === null) {
        this.announceUncontracted();
      }
      this.textCells = hex === null
        ? TactileBraille.toCells(description)
        : TactileService.cellsFromHex(hex);
      // Back to the start again: a scroll key pressed while this was in flight
      // moved the window, and honouring it would open the new description
      // partway through a sentence the reader has not met the start of.
      this.textWindow = 0;
      this.writeTextWindow(cellCount);
    });
  }

  /**
   * Reads a hex braille payload back into cell patterns, so a translated line
   * windows and scrolls exactly like a locally translated one.
   * @param hex - Hex braille cells, two characters each
   */
  private static cellsFromHex(hex: string): number[] {
    const cells: number[] = [];
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const cell = Number.parseInt(hex.slice(i, i + 2), 16);
      cells.push(Number.isNaN(cell) ? 0 : cell);
    }
    return cells;
  }

  /**
   * Sends the current window of the text line, skipping an unchanged payload.
   * @param cellCount - Cells on the device's text line
   */
  private writeTextWindow(cellCount: number): void {
    const hex = DotPack.brailleCells(
      TactileBraille.window(this.textCells, cellCount, this.textWindow),
      cellCount,
    );
    if (hex === this.lastText) {
      return;
    }
    this.lastText = hex;
    dotPadSession.writeText(hex);
  }

  /**
   * Lowers every pin, so turning braille off leaves the device blank rather
   * than holding a chart the reader has moved on from.
   */
  private blank(): void {
    const geometry = dotPadSession.geometry;
    if (geometry === null || !dotPadSession.isConnected) {
      return;
    }
    const blank = new DotRaster(geometry.dotWidth, geometry.dotHeight);
    dotPadSession.writeGraphic(DotPack.graphic(blank, geometry.cellColumns, geometry.cellRows));
    if (geometry.textCells > 0) {
      const blankText = DotPack.brailleCells([], geometry.textCells);
      this.textCells = [];
      this.textWindow = 0;
      // Any translation still in flight would otherwise land on a display the
      // reader has just switched off.
      this.textRequest++;
      this.lastText = blankText;
      dotPadSession.writeText(blankText);
    }
    this.lastRaster = blank;
  }

  /**
   * Releases this chart's subscriptions.
   *
   * Deliberately does NOT disconnect the device. This runs on every focus-out
   * and tab switch, and reconnecting needs a user gesture that cannot be asked
   * for mid-session — dropping the connection here would make the display
   * unusable in ordinary use.
   */
  public dispose(): void {
    this.disposed = true;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.lastRaster = null;
    this.lastText = null;
    this.textCells = [];
    this.textWindow = 0;
    this.textRequest++;
    this.lastState = null;
    this.viewport = null;
    this.shapeCache = null;
  }
}
