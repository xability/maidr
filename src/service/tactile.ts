import type { Figure, Subplot, Trace } from '@model/plot';
import type { Disposable } from '@type/disposable';
import type { DotPadKey } from '@type/dotPad';
import type { Observer } from '@type/observable';
import type { FigureState, HighlightState, NonEmptyTraceState, SubplotState, TraceState } from '@type/state';
import type { TactileScene } from '@util/tactile/render';
import type { ClientRect, PanDirection } from '@util/tactile/viewport';
import type { BrailleService } from './braille';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { TextService } from './text';
import { TactileBraille } from '@util/tactile/brailleText';
import { DotPack } from '@util/tactile/pack';
import { DotRaster } from '@util/tactile/raster';
import { TactileRenderer } from '@util/tactile/render';
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
  private readonly braille: BrailleService;
  private readonly notification: NotificationService;
  private readonly text: TextService;

  private figure: Figure;

  /**
   * Zoom and pan over the chart. Rebuilt when the chart region changes size.
   */
  private viewport: TactileViewport | null = null;

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
    this.braille = braille;
    this.notification = notification;
    this.text = text;
    this.figure = figure;

    this.disposables.push(braille.onToggle((event) => {
      if (event.enabled) {
        this.viewport?.reset();
        this.shapeCache = null;
        // Every chart in a notebook is its own iframe and so its own
        // connection, but the permission behind it belongs to the page. Taking
        // the display up here — silently, no picker — is what makes the reader
        // pair once for the page rather than once for every chart.
        if (!dotPadSession.isConnected) {
          void dotPadSession.adopt().then((adopted) => {
            if (!adopted) {
              return;
            }
            // Braille may have gone off again while this was in flight — a
            // double press of `b` is enough. The release on the way out found
            // nothing to release, because the adoption had not happened yet,
            // so it has to happen here instead: otherwise the display stays
            // checked out to a chart whose panel is shut, and the next chart
            // to want it finds the device already open and gives up quietly.
            // A newer controller may own this frame by now — focus-out
            // disposes on a 0ms timer and this took a round trip. It shares
            // the same session, so handing the device back here would take it
            // from a chart that is using it.
            if (this.disposed) {
              return;
            }
            if (this.braille.isEnabled) {
              this.refresh();
            } else {
              dotPadSession.releaseIfAdopted();
            }
          });
        }
        this.refresh();
      } else {
        this.blank();
        // Handed back so the next chart can take it. Only if it was adopted:
        // a display the reader connected here on purpose stays here.
        dotPadSession.releaseIfAdopted();
      }
    }));

    this.disposables.push(dotPadSession.onKey((key) => {
      this.handleDeviceKey(key);
    }));

    this.disposables.push(dotPadSession.onStateChange((state) => {
      if (state.status === 'connected') {
        this.lastRaster = null;
        this.lastText = null;
        this.shapeCache = null;
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
    return this.braille.isEnabled && dotPadSession.isConnected;
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
  private redraw(followFocus: boolean): boolean {
    const state = this.lastState;
    if (state === null || !this.isActive) {
      return false;
    }
    try {
      return this.draw(state, followFocus);
    } catch (error) {
      console.error('Tactile render failed:', error instanceof Error ? error.message : error);
      return false;
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
   * @param viewport - The viewport that just moved
   * @param changed - Whether the redraw actually altered the pins
   */
  private announceView(viewport: TactileViewport, changed: boolean): void {
    this.notification.notify(changed
      ? viewport.describe()
      : `${viewport.describe()}; the pins are unchanged`);
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
   * than a doubled copy of it.
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
    return shapes;
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
  private draw(state: DrawableState, followFocus: boolean): boolean {
    const geometry = dotPadSession.geometry;
    const region = this.findRegionElement();
    if (geometry === null || region === null) {
      return false;
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
      return false;
    }

    if (this.viewport === null) {
      this.viewport = new TactileViewport(source, geometry.dotWidth, geometry.dotHeight);
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

    // Both lists come from the trace's highlight values, so the focused mark is
    // the same object in each and the renderer's identity check pairs them:
    // the mark the reader is on is drawn once, filled.
    const scene: TactileScene = { marks, focused };

    const raster = TactileRenderer.render(
      scene,
      this.viewport,
      geometry.dotWidth,
      geometry.dotHeight,
    );

    const changed = this.send(raster, geometry.cellColumns, geometry.cellRows);
    this.sendText(state, geometry.textCells);
    return changed;
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
