import type { Figure, Subplot, Trace } from '@model/plot';
import type { Disposable } from '@type/disposable';
import type { DotPadKey } from '@type/dotPad';
import type { Observer } from '@type/observable';
import type { FigureState, HighlightState, NonEmptyTraceState, SubplotState, TraceState } from '@type/state';
import type { PixelImage, PixelRect } from '@util/tactile/canvasRaster';
import type { TactileScene } from '@util/tactile/render';
import type { DotProjector, DotRing } from '@util/tactile/svgGeometry';
import type { ClientRect, PanDirection, TactileAspect } from '@util/tactile/viewport';
import type { BrailleService } from './braille';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { t } from '@util/i18n';
import { OVERLAY_ATTRIBUTES, readOverlayRegions } from '@util/overlayRegions';
import { TactileBraille } from '@util/tactile/brailleText';
import { TactileCanvas } from '@util/tactile/canvasRaster';
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
 * Whether a redraw moves the window to the focused mark.
 *
 * `centre` always does, and is what a zoom step asks for: the reader zooms to
 * feel the mark they are on in more detail, so it has to be in the middle of
 * the pins at every level, in and out, where a hand already resting there
 * finds it without searching. `offscreen` moves only when the focus has left
 * the window, which is what navigation wants -- a pan the reader chose stays
 * put for as long as it still shows their point. `none` never moves, for the
 * redraw a pan asks for.
 */
type FocusFollow = 'centre' | 'offscreen' | 'none';

/**
 * How close two edges have to be, in screen pixels, to count as the same
 * line. Enough to absorb the sub-pixel rounding a renderer leaves between
 * bars that share a baseline.
 */
const SHARED_EDGE_TOLERANCE = 0.5;

/**
 * Leaves points where the page draws them, so a mark's outline can be read in
 * screen pixels rather than in pins.
 */
/**
 * What a frame is drawn from, whichever way the chart itself was drawn.
 */
interface TactilePicture {
  /**
   * The screen rectangle mapped onto the pins at whole-plot zoom.
   */
  source: ClientRect;

  /**
   * The active layer's marks, where the chart has marks to name; empty for a
   * canvas.
   */
  marks: SVGGraphicsElement[];

  /**
   * What stands for the focused point.
   */
  focused: Element[];

  /**
   * Draws the picture through a viewport.
   */
  render: (viewport: TactileViewport, width: number, height: number) => DotRaster;

  /**
   * The nearest point that has something drawn at it, for a zoom that would
   * otherwise land on nothing.
   */
  nearestContent: (
    target: { x: number; y: number },
    window: { width: number; height: number },
  ) => { x: number; y: number } | null;
}

const SCREEN: DotProjector = {
  toDot: (x: number, y: number) => ({ x, y }),
};

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
 * Trace types whose one mark only means something against the panel around
 * it.
 *
 * A gauge is a single bar, and the bar is not the reading -- where it ends
 * against the bands behind it and the target line beside it is. The model
 * hands over the bar alone, so drawn from the model the window is the bar,
 * the bar is the window, and the reader is handed a rectangle the size of the
 * display that says nothing. For these the chart's own subtree is drawn as
 * well, furniture sifted out, so the bands and the target are on the pins and
 * the bar is filled among them.
 */
const READ_AGAINST_THE_PANEL: ReadonlySet<string> = new Set([
  'gauge',
]);

/**
 * Trace types whose marks are connectors between two values.
 *
 * A dumbbell's bar joins its start and its end, and those are what the reader
 * is after; the bar is the distance between them. See
 * {@link TactileScene.endCaps}.
 */
const CONNECTOR_MARKS: ReadonlySet<string> = new Set([
  'dumbbell',
]);

/**
 * Layers drawn under whichever layer is active.
 *
 * One layer at a time is the rule, because sixty pins cannot hold three
 * overlaid series. A violin is the exception the rule is not about: its
 * density curve and its inner box are two layers of one mark, and the reader
 * lands on the box first. Drawn alone the box is a bare whisker with no
 * violin around it -- the shape that names the chart is on the layer they
 * have not reached yet. The curve is an outline and costs the pins an outline
 * does, so it stays under the box as the thing the box is inside.
 */
const ALWAYS_SHOWN_LAYERS: ReadonlySet<string> = new Set([
  'violin_kde',
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
   *
   * Read on each use rather than held in a field, so it is rendered in the
   * language in force when it is said, not the one loaded in.
   */
  private static get noView(): string {
    return t('tactile.noView');
  }

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
   * The description the text line was last built from, so a redraw of the
   * same state -- a zoom, a pan, a repair -- leaves the line alone. Only a
   * different description sends the reader back to its start; see
   * {@link sendText}.
   */
  private lastDescription: string | null = null;

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
    this.lastDescription = null;
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

    // A chart drawn on a canvas is drawn a task later. Its focus is the box the
    // adapter lays over the canvas, and the adapter moves that box on the same
    // move this is being told about -- after this, as it happens -- so drawn
    // now the pins filled the point the reader had just left.
    if (this.findRegionElement() === null) {
      this.scheduleCanvasDraw();
      return;
    }

    try {
      this.draw(state, 'offscreen');
    } catch (error) {
      // A hardware or geometry failure must not break the navigation the
      // reader is in the middle of; the audio and text channels carry on.
      console.error('Tactile render failed:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Pending redraw of a canvas chart; see {@link update}.
   */
  private canvasDrawTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Redraws a canvas chart once the adapter has moved its highlight, folding
   * a burst of moves into one frame -- and once more when the chart has
   * settled.
   *
   * The second pass is for what the library animates. Chart.js slides its
   * tooltip to the new point over a few hundred milliseconds; the adapter
   * says where it will come to rest, and that is masked out, but the first
   * pass reads the canvas while it is still on its way and finds it
   * somewhere in between. Redrawing once it has arrived costs nothing when
   * nothing moved: an unchanged frame is not sent.
   */
  private scheduleCanvasDraw(): void {
    if (this.canvasDrawTimer !== null) {
      clearTimeout(this.canvasDrawTimer);
    }
    const pass = (settle: boolean): void => {
      this.canvasDrawTimer = null;
      if (this.disposed) {
        return;
      }
      // Only the first pass follows the focus. By the second the reader may
      // have panned, and following again would undo the pan unannounced.
      this.redraw(settle ? 'none' : 'offscreen');
      if (!settle) {
        this.canvasDrawTimer = setTimeout(() => pass(true), TactileService.CANVAS_SETTLE_MS);
      }
    };
    this.canvasDrawTimer = setTimeout(() => pass(false), 0);
  }

  /**
   * How long a canvas chart is given to finish animating before it is read
   * again; see {@link scheduleCanvasDraw}. Chart.js's default animation runs
   * for 400.
   */
  private static readonly CANVAS_SETTLE_MS = 500;

  /**
   * Thickest a line on a canvas chart is drawn, in CSS pixels, with its
   * anti-aliasing and measured across or down: Chart.js draws a line three
   * pixels wide by default, and a highlighted one wider, and a line sloping
   * at forty-five degrees measures half as thick again either way. Anything this thin is a line, not a shape to
   * outline; see {@link TactileCanvas.render}.
   */
  private static readonly CANVAS_STROKE_PX = 8;

  /**
   * Redraws from the last known state, for changes that did not come from a
   * navigation move — a zoom step, a pan, or the device connecting.
   */
  public refresh(): void {
    this.redraw('offscreen');
  }

  /**
   * Redraws from the last known state.
   * @param follow - Whether the window moves to the focused mark; see
   * {@link FocusFollow}
   * @returns What the redraw did to the pins
   */
  private redraw(follow: FocusFollow): FrameOutcome {
    const state = this.lastState;
    if (state === null || !this.isActive) {
      return 'unchanged';
    }
    try {
      return this.draw(state, follow);
    } catch (error) {
      console.error('Tactile render failed:', error instanceof Error ? error.message : error);
      return 'unchanged';
    }
  }

  /**
   * Zooms the tactile view in one step.
   */
  public zoomIn(): void {
    this.changeZoom(viewport => viewport.zoomIn(), t('tactile.zoomAtClosest'));
  }

  /**
   * Zooms the tactile view out one step.
   */
  public zoomOut(): void {
    this.changeZoom(viewport => viewport.zoomOut(), t('tactile.zoomAtWholePlot'));
  }

  /**
   * Returns the tactile view to the whole plot.
   *
   * Stepping back out works, but the steps are multiplicative and there are
   * eight of them: from the closest zoom that is seven presses, each redrawing
   * a frame the reader does not want and waiting on the device to take it. One
   * key is the difference between recovering a view you have lost and picking
   * your way back to it.
   */
  public resetZoom(): void {
    this.changeZoom(viewport => viewport.reset(), t('tactile.zoomAtWholePlot'));
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
      this.notification.notify(TactileService.noView);
      return;
    }
    if (!step(viewport)) {
      this.notification.notify(refusal);
      return;
    }
    // Centres on the focus, unlike a pan, and on every step rather than only
    // when the focus has left the window. Zoom is asked for to feel one mark
    // more closely, and the mark meant is the one the reader is on. Following
    // only on exit let each step close in on wherever the window happened to
    // be, so the mark drifted towards an edge and the reader had to search for
    // it again after every press; kept in the middle, it is under the hand
    // that was already on it, in and out alike.
    this.announceView(viewport, this.redraw('centre'));
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
      this.notification.notify(TactileService.noView);
      return;
    }
    if (!viewport.pan(direction)) {
      this.notification.notify(viewport.isWholePlotVisible
        ? t('tactile.panWholePlot')
        : TactileService.edgeRefusal(direction));
      return;
    }
    this.announceView(viewport, this.redraw('none'));
  }

  /**
   * What to say when a pan is refused at the edge of the plot.
   *
   * "Above" and "below" rather than "to the up": the direction names are the
   * viewport's vocabulary, not a sentence.
   *
   * @param direction - The way the reader tried to move
   */
  private static edgeRefusal(direction: PanDirection): string {
    switch (direction) {
      case 'up':
        return t('tactile.panEdgeUp');
      case 'down':
        return t('tactile.panEdgeDown');
      case 'left':
        return t('tactile.panEdgeLeft');
      default:
        return t('tactile.panEdgeRight');
    }
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
    const view = viewport.describe();
    if (outcome === 'empty') {
      this.notification.notify(t('tactile.viewEmpty', { view }));
      return;
    }
    if (outcome === 'unchanged') {
      this.notification.notify(t('tactile.viewUnchanged', { view }));
      return;
    }
    this.notification.notify(view);
  }

  /**
   * Reports whether the display can act, telling the reader why when it cannot.
   */
  private requireActive(): boolean {
    if (this.isActive) {
      return true;
    }
    this.notification.notify(dotPadSession.isConnected
      ? t('tactile.brailleOff')
      : t('tactile.notConnected'));
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
   * Nothing is spoken on a move. The reader is reading the line with their
   * fingers, and a voice saying "part 2 of 4" on every press talks over the
   * very thing they are reading while telling them nothing the cells do not.
   * The one thing the cells cannot say is that there is no more line, so only
   * that is signalled -- by a buzz, under the hand that pressed the key. Where
   * the SDK cannot vibrate, the edge is spoken instead, since a key that does
   * nothing and says nothing is indistinguishable from a broken one.
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
      this.signalLineEdge(t('tactile.lineWholeShown'));
      return;
    }

    const next = Math.min(Math.max(this.textWindow + step, 0), lastWindow);
    if (next === this.textWindow) {
      this.signalLineEdge(step < 0 ? t('tactile.lineStart') : t('tactile.lineEnd'));
      return;
    }

    this.textWindow = next;
    this.writeTextWindow(cellCount);
  }

  /**
   * Tells the reader the text line goes no further in the way they pressed.
   * @param fallback - What to say when the device cannot vibrate
   */
  private signalLineEdge(fallback: string): void {
    if (!dotPadSession.vibrate()) {
      this.notification.notify(fallback);
    }
  }

  /**
   * The root SVG of the chart, or null when it cannot be found.
   */
  private findSvg(): SVGSVGElement | null {
    // Not the highlight a canvas adapter lays over its chart: a pie slice is
    // highlighted with an SVG, and taking that for the chart drew the one
    // slice and nothing else.
    const svgs = Array.from(this.display.plot.querySelectorAll('svg'));
    return svgs.find(svg => svg.closest(`[${OVERLAY_ATTRIBUTES.layer}], [${OVERLAY_ATTRIBUTES.highlight}]`) === null) ?? null;
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
    const context = this.contextShapes(region);
    const fromModel = this.modelShapes();
    const own = fromModel.length > 0 ? fromModel : TactileService.collectShapes(region);
    const shapes = TactileService.distinct([...context, ...own]);
    const allLayers = fromModel.length > 0
      ? TactileService.distinct([...context, ...this.allLayerShapes()])
      : shapes;
    this.shapeCache = { region, subplot, trace, shapes, allLayers };
    return this.shapeCache;
  }

  /**
   * What is drawn around the active layer's marks, on the charts that need
   * it: the panel a gauge is read against, and the layers a violin keeps under
   * whichever one is active. Empty for everything else, which is nearly
   * everything.
   *
   * @param region - The element whose subtree holds the chart
   */
  private contextShapes(region: Element): SVGGraphicsElement[] {
    const subplot = this.figure.activeSubplot;
    const active = subplot.activeTrace;
    const context: SVGGraphicsElement[] = [];
    if (active !== null && READ_AGAINST_THE_PANEL.has(active.traceType)) {
      context.push(...TactileService.collectShapes(region));
    }
    for (const row of subplot.traces) {
      for (const trace of row) {
        if (trace !== active && ALWAYS_SHOWN_LAYERS.has(trace.traceType)) {
          context.push(...TactileService.traceShapes(trace));
        }
      }
    }
    return context;
  }

  /**
   * The elements with duplicates removed, first occurrence kept.
   *
   * The renderer draws a union, so a mark listed twice costs pins and nothing
   * else; but a mark in both the context and the model's own list would be
   * outlined by one and filled by the other, and the pairing that draws a
   * focused mark once relies on it appearing once.
   *
   * @param elements - Elements in drawing order
   */
  private static distinct(elements: readonly SVGGraphicsElement[]): SVGGraphicsElement[] {
    return Array.from(new Set(elements));
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
  private static boundsOf(elements: readonly Element[]): ClientRect | null {
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
   * The point of the focused mark the window is centred on.
   *
   * Its middle, on every axis where the mark fits in the window. Where it does
   * not -- a tall bar, a few steps in -- the middle is the one place on the
   * mark with nothing to feel: its top and its baseline are both off the pins,
   * so the bar arrives as two parallel lines, and a few steps further the
   * window is wholly inside it and every pin is down. The reader zoomed in to
   * feel the bar and loses it.
   *
   * So on that axis the window goes to the mark's value end instead: the edge
   * where the bar stops, which is the reading. It is told from the baseline by
   * what the other marks do. Bars stand on a common baseline, so the edge the
   * other marks share is the baseline and the other one is the value -- the
   * top of a positive bar, the bottom of a negative one, the right end of a
   * horizontal one, with no need to know the chart's orientation or sign.
   * Where neither edge is shared more than the other there is no baseline to
   * read, and the middle stays.
   *
   * A chart read from a canvas has no marks to compare, only the focus box.
   * There the common case is taken: a bar taller than wide is held by its top,
   * one wider than tall by its right end. Left in the middle, a canvas bar was
   * two parallel lines from the first step it outgrew the window.
   *
   * @param focus - The focused mark's bounds, in viewport pixels
   * @param marks - Every mark on the active layer
   * @param window - The visible window's size, in viewport pixels
   * @param window.width - Window width in viewport pixels
   * @param window.height - Window height in viewport pixels
   */
  private static anchorOf(
    focus: ClientRect,
    marks: readonly SVGGraphicsElement[],
    window: { width: number; height: number },
  ): { x: number; y: number } {
    const centreX = focus.left + focus.width / 2;
    const centreY = focus.top + focus.height / 2;
    const fitsX = focus.width <= window.width;
    const fitsY = focus.height <= window.height;
    if (fitsX && fitsY) {
      return { x: centreX, y: centreY };
    }

    const boxes = marks.map(mark => mark.getBoundingClientRect());
    const sharing = (edge: number, near: (box: DOMRect) => number, far: (box: DOMRect) => number): number =>
      boxes.filter(box => Math.abs(near(box) - edge) <= SHARED_EDGE_TOLERANCE
        || Math.abs(far(box) - edge) <= SHARED_EDGE_TOLERANCE).length;
    const valueEnd = (low: number, high: number, centre: number, lowShared: number, highShared: number): number => {
      if (lowShared > highShared) {
        return high;
      }
      if (highShared > lowShared) {
        return low;
      }
      return centre;
    };
    if (marks.length === 0) {
      const tall = focus.height >= focus.width;
      return {
        x: fitsX || tall ? centreX : focus.left + focus.width,
        y: fitsY || !tall ? centreY : focus.top,
      };
    }

    const right = focus.left + focus.width;
    const bottom = focus.top + focus.height;
    return {
      x: fitsX
        ? centreX
        : valueEnd(
            focus.left,
            right,
            centreX,
            sharing(focus.left, box => box.left, box => box.right),
            sharing(right, box => box.left, box => box.right),
          ),
      y: fitsY
        ? centreY
        : valueEnd(
            focus.top,
            bottom,
            centreY,
            sharing(focus.top, box => box.top, box => box.bottom),
            sharing(bottom, box => box.top, box => box.bottom),
          ),
    };
  }

  /**
   * The point on the elements' outlines nearest a target, in viewport pixels.
   *
   * Distance is measured in windows rather than pixels, so a window stretched
   * onto the pins weighs a step across the same as a step down.
   *
   * It moves only along the axes it is free on. A floating waterfall bar fits
   * the window across but not down, so it is the top or the bottom that has to
   * come into reach; allowed to move either way, the nearest outline is one of
   * the bar's long sides, and the reader is handed two parallel lines with both
   * ends of the bar off the pins.
   *
   * @param elements - The marks whose outlines to search
   * @param target - Where the window would otherwise be centred
   * @param target.x - Horizontal position in viewport pixels
   * @param target.y - Vertical position in viewport pixels
   * @param window - The visible window's size, in viewport pixels
   * @param window.width - Window width in viewport pixels
   * @param window.height - Window height in viewport pixels
   * @param free - The axes the point may move along, both by default
   * @param free.x - Whether it may move across
   * @param free.y - Whether it may move down
   * @returns The nearest outline point, or null when no outline can be read
   */
  private static nearestOutlinePoint(
    elements: readonly Element[],
    target: { x: number; y: number },
    window: { width: number; height: number },
    free: { x: boolean; y: boolean } = { x: true, y: true },
  ): { x: number; y: number } | null {
    // An axis the point may not move along is weighed so heavily that any
    // point on the target's line beats every point off it.
    const LOCKED = 1e-6;
    const scaleX = (window.width > 0 ? window.width : 1) * (free.x ? 1 : LOCKED);
    const scaleY = (window.height > 0 ? window.height : 1) * (free.y ? 1 : LOCKED);
    let best: { x: number; y: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    const consider = (x: number, y: number): void => {
      const distance = ((x - target.x) / scaleX) ** 2 + ((y - target.y) / scaleY) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    };

    // Piece by piece, as the renderer draws them: run together, the pieces of
    // one path are joined by lines the chart never drew, and the nearest
    // point could land on one of those, in the gap between the pieces.
    const pieces = elements.flatMap(element => TactileService.outlineRingsOf(element, SCREEN))
      .flatMap(ring => ring.parts ?? [{ points: ring.points, closed: ring.closed }]);
    for (const piece of pieces) {
      const points = piece.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
      if (points.length === 0) {
        continue;
      }
      if (points.length === 1) {
        consider(points[0].x, points[0].y);
        continue;
      }
      const segments = piece.closed ? points.length : points.length - 1;
      for (let index = 0; index < segments; index++) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        // The foot of the perpendicular, in window units, clamped to the
        // segment.
        const dx = (to.x - from.x) / scaleX;
        const dy = (to.y - from.y) / scaleY;
        const length = dx * dx + dy * dy;
        const along = length === 0
          ? 0
          : Math.min(1, Math.max(0, (((target.x - from.x) / scaleX) * dx + ((target.y - from.y) / scaleY) * dy) / length));
        consider(from.x + (to.x - from.x) * along, from.y + (to.y - from.y) * along);
      }
    }
    return best;
  }

  /**
   * Renders the current state and sends it to the device.
   * @param state - The trace state to draw
   * @param follow - Whether the window moves to the focused mark; see
   * {@link FocusFollow}
   * @returns What the redraw did to the pins
   */
  private draw(state: DrawableState, follow: FocusFollow): FrameOutcome {
    const geometry = dotPadSession.geometry;
    if (geometry === null) {
      return 'unchanged';
    }
    const region = this.findRegionElement();
    const svg = region === null ? null : this.svgPicture(region, state);
    const aspect = TactileService.aspectFor(state);
    // A chart with SVG may still have drawn its marks on a canvas beside it:
    // plotly draws a parallel-coordinates chart's axes in SVG and every one of
    // its lines in WebGL, and the SVG then holds a few markers and nothing
    // else. Where a canvas covers the chart, the picture that shows more of it
    // with the whole plot in view is the one drawn -- decided at whole-plot
    // zoom, so it does not change from one zoom step to the next. Asked only
    // where there is a canvas to turn to, so an ordinary SVG chart pays
    // nothing for it.
    let picture = svg;
    if (svg === null || this.chartCanvases().length > 0) {
      const canvas = this.canvasPicture(state);
      if (svg === null) {
        picture = canvas;
      } else if (canvas !== null) {
        const atRest = (candidate: TactilePicture): number => candidate.render(
          new TactileViewport(candidate.source, geometry.dotWidth, geometry.dotHeight, aspect),
          geometry.dotWidth,
          geometry.dotHeight,
        ).raisedCount;
        if (atRest(canvas) > 2 * atRest(svg)) {
          picture = canvas;
        }
      }
    }
    if (picture === null) {
      return 'unchanged';
    }

    if (this.viewport === null || this.aspect !== aspect) {
      // Rebuilt rather than adjusted when the mode changes: a layer switch can
      // move between a shape chart and an ordinary one, and the two map the
      // same rect onto different pins.
      this.viewport = new TactileViewport(picture.source, geometry.dotWidth, geometry.dotHeight, aspect);
      this.aspect = aspect;
    } else {
      this.viewport.setSource(picture.source);
    }
    const viewport = this.viewport;
    const focused = picture.focused;

    // Follow the focus on a zoom step, and on a navigation move that took it
    // off the view, and never on the redraw a pan asks for. Panning is what
    // moves the focus out of view deliberately, so recentring there would undo
    // the reader's own pan on the very redraw it triggered — and for a mark
    // bigger than the window, which can never be contained, panning would
    // never move at all while still announcing that it had.
    if (follow !== 'none') {
      const focusBounds = TactileService.boundsOf(focused);
      if (focusBounds !== null
        && (follow === 'centre' || !viewport.containsRect(focusBounds))) {
        const window = viewport.windowSize;
        const target = TactileService.anchorOf(focusBounds, picture.marks, window);
        // A mark that fits is seen whole wherever in it the window sits. One
        // that does not is only seen by its outline, so the window goes to the
        // nearest point of that outline: the middle of a bounding box can be
        // inside a bar with no edge in reach, or -- for a pie wedge or a
        // sunburst arc -- somewhere the shape does not reach at all.
        const free = {
          x: focusBounds.width > window.width,
          y: focusBounds.height > window.height,
        };
        const anchor = free.x || free.y
          ? TactileService.nearestOutlinePoint(focused, target, window, free) ?? target
          : target;
        viewport.centreOnPoint(anchor.x, anchor.y);
      }
    }

    let raster = picture.render(viewport, geometry.dotWidth, geometry.dotHeight);

    // A zoom step must not land on an empty display. Every pin down is also
    // what a disconnected display feels like, and a reader who zoomed in to
    // feel more of the chart gets less than nothing. It happens where the
    // focus gives no position to close in on -- the multi-panel lobby, or a
    // chart whose focused point has no element of its own -- and the window
    // stays on a patch of the plot with nothing in it. So the window moves to
    // the nearest mark there is, which keeps the view as close as it can to
    // where the reader was. A pan is left alone: an empty window is where the
    // reader deliberately took it, and they are told it is empty.
    if (raster.raisedCount === 0 && follow === 'centre' && !viewport.isWholePlotVisible) {
      const nearest = picture.nearestContent(viewport.windowCentre, viewport.windowSize);
      if (nearest !== null) {
        viewport.centreOnPoint(nearest.x, nearest.y);
        raster = picture.render(viewport, geometry.dotWidth, geometry.dotHeight);
      }
    }

    const changed = this.send(raster, geometry.cellColumns, geometry.cellRows);
    this.sendText(state, geometry.textCells);
    if (raster.raisedCount === 0) {
      return 'empty';
    }
    return changed ? 'changed' : 'unchanged';
  }

  /**
   * The chart as the SVG draws it: its marks, its focus, and a renderer that
   * traces their shapes.
   *
   * @param region - The element whose subtree holds the chart
   * @param state - The state being drawn
   * @returns The picture, or null when the chart has no measurable extent
   */
  private svgPicture(region: SVGGraphicsElement, state: DrawableState): TactilePicture | null {
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
      return null;
    }

    // The lobby has no focused mark: its highlight is the whole panel, and
    // filling that would raise every pin the panel covers. Its marks are drawn
    // as outlines and nothing is solid, which is the truth — the reader has not
    // chosen a point yet.
    const focused = state.type === 'trace'
      ? TactileService.focusedElements(state.highlight)
      : [];

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
    const scene: TactileScene = {
      marks,
      focused,
      shades: TactileService.shadesOf(marks, state),
      endCaps: state.type === 'trace' && CONNECTOR_MARKS.has(state.traceType),
    };

    return {
      source,
      marks,
      focused,
      render: (viewport, width, height) => TactileRenderer.render(scene, viewport, width, height),
      nearestContent: (target, window) => TactileService.nearestOutlinePoint(marks, target, window),
    };
  }

  /**
   * How far up from the plot element a chart's canvases are looked for.
   */
  private static readonly CANVAS_SEARCH_DEPTH = 8;

  /**
   * The canvases the chart is drawn on.
   *
   * Inside the plot element for a chart drawn wholly on a canvas. But a
   * library that draws part of a chart in SVG and the rest on a canvas keeps
   * the canvas where it put it: plotly's parallel coordinates has its WebGL
   * canvases in its own container, around the element MAIDR wraps. So the
   * search walks up from the plot, and stops at the first element holding
   * canvases that cover the chart -- never reaching a canvas that belongs to
   * some other chart on the page, which would not lie over this one.
   */
  private chartCanvases(): HTMLCanvasElement[] {
    // The plot element can be a wrapper with no size of its own -- plotly's
    // is -- so the chart's SVG stands in for it when it has one.
    const own = this.display.plot.getBoundingClientRect();
    const plot = own.width > 0 && own.height > 0
      ? own
      : this.findRegionElement()?.getBoundingClientRect() ?? own;
    let node: HTMLElement | null = this.display.plot;
    for (let depth = 0; node !== null && depth < TactileService.CANVAS_SEARCH_DEPTH; depth++) {
      const covering = Array.from(node.querySelectorAll('canvas')).filter((canvas) => {
        const box = canvas.getBoundingClientRect();
        const width = Math.min(box.right, plot.right) - Math.max(box.left, plot.left);
        const height = Math.min(box.bottom, plot.bottom) - Math.max(box.top, plot.top);
        const smaller = Math.min(box.width * box.height, plot.width * plot.height);
        return width > 0 && height > 0 && smaller > 0 && (width * height) / smaller >= 0.5;
      });
      if (covering.length > 0) {
        return covering;
      }
      node = node.parentElement;
    }
    return [];
  }

  /**
   * The chart as a canvas draws it, for the charting libraries that draw no
   * SVG at all -- Chart.js, amCharts, a WebGL layer.
   *
   * There are no shapes to trace, so the pins are read off the picture the
   * canvas holds; see {@link TactileCanvas}. The focus comes from the box MAIDR
   * draws over the canvas to highlight the point for sighted readers, which
   * is the one place the position of the focused mark is written down.
   *
   * @param state - The state being drawn
   * @returns The picture, or null when there is no canvas, or none that can
   * be read
   */
  private canvasPicture(state: DrawableState): TactilePicture | null {
    const snapshot = TactileService.snapshotCanvases(this.display.plot, this.chartCanvases());
    if (snapshot === null) {
      return null;
    }
    const { image, rect, scaleX, scaleY } = snapshot;

    // The plot area, where the adapter knows it: the canvas also holds the
    // title, the axis labels and the legend, which the SVG path never draws
    // and which here would come out as blots of text. And whatever the library
    // painted over the data -- Chart.js's tooltip at the focused point -- is
    // read as background, or it would be felt as a mark.
    const layer = this.display.plot.querySelector(`[${OVERLAY_ATTRIBUTES.layer}]`);
    const regions = layer === null ? { plotArea: null, exclude: [] } : readOverlayRegions(layer);
    const source = TactileService.intersect(rect, regions.plotArea) ?? rect;
    const masks: PixelRect[] = regions.exclude.map(box => ({
      left: (box.left - rect.left) * scaleX,
      top: (box.top - rect.top) * scaleY,
      right: (box.right - rect.left) * scaleX,
      bottom: (box.bottom - rect.top) * scaleY,
    }));

    // As in the SVG lobby, a panel the reader has not entered has no point to
    // stand on.
    const focused = state.type === 'trace'
      ? TactileService.overlayFocus(this.display.plot)
      : [];

    const render = (viewport: TactileViewport, width: number, height: number): DotRaster => {
      const raster = TactileCanvas.render(image, (x, y) => {
        const from = viewport.toClient(x - 0.5, y - 0.5);
        const to = viewport.toClient(x + 0.5, y + 0.5);
        if (!Number.isFinite(from.x) || !Number.isFinite(to.x)) {
          return null;
        }
        return {
          left: (Math.min(from.x, to.x) - rect.left) * scaleX,
          top: (Math.min(from.y, to.y) - rect.top) * scaleY,
          right: (Math.max(from.x, to.x) - rect.left) * scaleX,
          bottom: (Math.max(from.y, to.y) - rect.top) * scaleY,
        };
      }, width, height, masks, TactileService.CANVAS_STROKE_PX * Math.max(scaleX, scaleY));
      const rings = focused.flatMap(element => TactileService.outlineRingsOf(element, viewport));
      TactileRenderer.drawFocus(raster, rings, viewport.zoom);
      return raster;
    };

    const nearestContent = (
      target: { x: number; y: number },
      window: { width: number; height: number },
    ): { x: number; y: number } | null => {
      const background = TactileCanvas.backgroundOf(image);
      let best: { x: number; y: number } | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let py = 0; py < image.height; py += 2) {
        for (let px = 0; px < image.width; px += 2) {
          if (TactileCanvas.masked(masks, px, py)
            || !TactileCanvas.isInk(image, (py * image.width + px) * 4, background)) {
            continue;
          }
          const x = rect.left + px / scaleX;
          const y = rect.top + py / scaleY;
          if (x < source.left || y < source.top
            || x > source.left + source.width || y > source.top + source.height) {
            continue;
          }
          const distance = ((x - target.x) / window.width) ** 2 + ((y - target.y) / window.height) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = { x, y };
          }
        }
      }
      return best;
    };

    return { source, marks: [], focused, render, nearestContent };
  }

  /**
   * The overlap of two rectangles, or null when they do not overlap or the
   * second is absent.
   * @param rect - A rectangle
   * @param box - Edges of the other, or null
   * @param box.left - Left edge
   * @param box.top - Top edge
   * @param box.right - Right edge
   * @param box.bottom - Bottom edge
   */
  private static intersect(
    rect: ClientRect,
    box: { left: number; top: number; right: number; bottom: number } | null,
  ): ClientRect | null {
    if (box === null) {
      return null;
    }
    const left = Math.max(rect.left, box.left);
    const top = Math.max(rect.top, box.top);
    const right = Math.min(rect.left + rect.width, box.right);
    const bottom = Math.min(rect.top + rect.height, box.bottom);
    return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
  }

  /**
   * The chart's visible canvases, composited into one picture.
   *
   * Composited rather than read one by one because a library may draw a chart
   * across several stacked canvases, and a pin has to see what a sighted
   * reader sees: the layers in the order the page paints them.
   *
   * @param root - The element holding the chart
   * @param candidates - The chart's canvases; see {@link chartCanvases}
   * @returns The pixels, the screen rectangle they cover, and how many pixels
   * there are to a screen pixel each way; null when there is no visible
   * canvas or its pixels cannot be read
   */
  private static snapshotCanvases(root: HTMLElement, candidates: readonly HTMLCanvasElement[]): {
    image: PixelImage;
    rect: ClientRect;
    scaleX: number;
    scaleY: number;
  } | null {
    // The adapter's copy of the chart as it stood before anything was painted
    // over the data, where there is one; see `@util/overlayRegions`.
    const clean = root.querySelector<HTMLCanvasElement>(`canvas[${OVERLAY_ATTRIBUTES.cleanCanvas}]`);
    const layer = clean?.closest(`[${OVERLAY_ATTRIBUTES.layer}]`);
    if (clean && layer && clean.width > 0 && clean.height > 0) {
      const box = layer.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        try {
          const context = clean.getContext('2d', { willReadFrequently: true });
          if (context !== null) {
            return {
              image: context.getImageData(0, 0, clean.width, clean.height),
              rect: { left: box.left, top: box.top, width: box.width, height: box.height },
              scaleX: clean.width / box.width,
              scaleY: clean.height / box.height,
            };
          }
        } catch (error) {
          console.error('[TactileService] Clean canvas could not be read:', error instanceof Error ? error.message : error);
        }
      }
    }

    const canvases = candidates.filter((canvas) => {
      const box = canvas.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
        return false;
      }
      const style = window.getComputedStyle(canvas);
      return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
    });
    if (canvases.length === 0) {
      return null;
    }
    const rect = TactileService.boundsOf(canvases);
    if (rect === null || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    // At the resolution of the sharpest canvas, so a hairline drawn for a
    // high-density screen is still there to be found.
    const scale = Math.max(...canvases.map(canvas => canvas.width / canvas.getBoundingClientRect().width));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    try {
      const composite = document.createElement('canvas');
      composite.width = width;
      composite.height = height;
      const context = composite.getContext('2d', { willReadFrequently: true });
      if (context === null) {
        return null;
      }
      for (const canvas of canvases) {
        const box = canvas.getBoundingClientRect();
        context.drawImage(
          canvas,
          (box.left - rect.left) * scale,
          (box.top - rect.top) * scale,
          box.width * scale,
          box.height * scale,
        );
      }
      return { image: context.getImageData(0, 0, width, height), rect, scaleX: scale, scaleY: scale };
    } catch (error) {
      // A canvas that has drawn an image from another origin cannot be read,
      // and a document without a 2D context cannot composite one. Either way
      // there is no picture to put on the pins.
      console.error('[TactileService] Canvas could not be read:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  /**
   * The highlight MAIDR draws over a canvas chart, which marks the focused
   * point: a box for most marks, a wedge outline for a pie slice.
   *
   * A wedge is drawn as an SVG covering the whole chart, so it is the path
   * inside it that says where the slice is, not the SVG's own box.
   *
   * @param root - The element holding the chart
   */
  private static overlayFocus(root: HTMLElement): Element[] {
    const nodes = Array.from(root.querySelectorAll(`[${OVERLAY_ATTRIBUTES.highlight}]`));
    return nodes.flatMap((node) => {
      if (node.tagName.toLowerCase() === 'svg') {
        return Array.from(node.querySelectorAll('path, circle, rect, polygon, ellipse'));
      }
      return [node];
    }).filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 || box.height > 0;
    });
  }

  /**
   * The outline of any element that can mark a focus, in a projector's plane:
   * an SVG shape's own geometry, or an HTML box's rectangle.
   *
   * @param element - The element
   * @param projector - Where to measure it: the pins, or the screen
   */
  private static outlineRingsOf(element: Element, projector: DotProjector): DotRing[] {
    if (element instanceof SVGGraphicsElement) {
      return TactileSvgGeometry.ringsOf(element, projector);
    }
    const box = element.getBoundingClientRect();
    if (box.width <= 0 && box.height <= 0) {
      return [];
    }
    return [{
      points: [
        projector.toDot(box.left, box.top),
        projector.toDot(box.right, box.top),
        projector.toDot(box.right, box.bottom),
        projector.toDot(box.left, box.bottom),
      ],
      closed: true,
    }];
  }

  /**
   * Rebuilds what this service believes the device is showing, after a write
   * the connection refused.
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
   *
   * This only ever hears about the writes the vendor SDK refuses; see
   * {@link DotPadSession.onWriteFailure} for the frames it cannot see. A frame
   * the SDK accepted and the wire then lost is recovered the other way round:
   * a connection that fails hard enough is dropped by the SDK, and the
   * reconnect handler above forgets the frame exactly as this does.
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
      this.redraw('none');
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
    this.notification.notify(t('tactile.lineUncontracted'));
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
    // A redraw of the same state -- a zoom, a pan, a repair -- leaves the line
    // where the reader scrolled it. The pan keys move the graphic, not the
    // text, and sending the reader back to "Line part 1" on every one of them
    // made the outer function keys unusable while zoomed in. Only a line that
    // has nothing on it yet is written again.
    if (description === this.lastDescription) {
      if (this.lastText !== null) {
        return;
      }
      if (this.textCells.length > 0) {
        // The same line, with only the payload cached against retransmission
        // forgotten -- a write failure forgets it along with the frame. So the
        // window the reader is on is sent again rather than the line being
        // started over: rewinding to part 1 here would move them back through
        // a sentence they are half way into, on a failure they cannot see, and
        // re-translating would spend a round trip on text already translated.
        this.writeTextWindow(cellCount);
        return;
      }
    }
    this.lastDescription = description;
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
      this.lastDescription = null;
      dotPadSession.writeText(blankText);
    }
    this.lastRaster = blank;
  }

  /**
   * Releases this chart's subscriptions.
   *
   * Deliberately does NOT disconnect a device the reader connected here
   * themselves. This runs on every focus-out and tab switch, and reconnecting
   * one needs a user gesture that cannot be asked for mid-session — dropping
   * that connection here would make the display unusable in ordinary use.
   *
   * What it does do is leave the display the way turning braille off leaves
   * it. Nothing else closes the display on the way out: braille's own
   * `dispose()` does not fire its toggle, so {@link setShowing} never runs, and
   * the controller that replaces this one starts with the display off. Pins
   * left up then point the reader at a chart they have left while every other
   * channel says nothing is there. An adopted device is handed back for the
   * same reason: it is checked out to this frame and only this frame can
   * return it, so keeping it past focus-out is what makes the next chart's `b`
   * fail on a device another frame still holds — and re-adopting needs no
   * gesture, which is the whole point of adoption.
   */
  public dispose(): void {
    // Only what this chart put there. A display it never raised may be another
    // chart's, and blanking or releasing that would take it from under them.
    if (this.showing) {
      this.showing = false;
      this.blank();
      dotPadSession.releaseIfAdopted();
    }
    this.disposed = true;
    if (this.canvasDrawTimer !== null) {
      clearTimeout(this.canvasDrawTimer);
      this.canvasDrawTimer = null;
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.lastRaster = null;
    this.lastText = null;
    this.lastDescription = null;
    this.textCells = [];
    this.textWindow = 0;
    this.textRequest++;
    this.lastState = null;
    this.viewport = null;
    this.shapeCache = null;
  }
}
