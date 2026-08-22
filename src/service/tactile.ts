import type { Figure } from '@model/plot';
import type { Disposable } from '@type/disposable';
import type { DotPadKey } from '@type/dotPad';
import type { Observer } from '@type/observable';
import type { FigureState, HighlightState, NonEmptyTraceState, SubplotState, TextState, TraceState } from '@type/state';
import type { TactileScene } from '@util/tactile/render';
import type { ClientRect, PanDirection } from '@util/tactile/viewport';
import type { BrailleService } from './braille';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
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
 * How hardware keys move the tactile view.
 *
 * The display's own panning keys pan horizontally, which is what a reader
 * reaches for first, and function keys 1 and 4 — the outermost pair, at the two
 * ends of the row — pan vertically. Putting all four on the device means a
 * zoomed-in reader can cross the whole chart without taking a hand off it.
 */
const KEY_PAN: Readonly<Partial<Record<DotPadKey, PanDirection>>> = {
  panLeft: 'left',
  panRight: 'right',
  function1: 'up',
  function4: 'down',
};

/**
 * Draws the focused chart onto a connected tactile display, and puts the
 * focused value on its braille text line.
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
  private lastState: NonEmptyTraceState | null = null;

  /**
   * The payload currently on the braille text line, so an unchanged value is
   * not retransmitted. Writes share one serialised queue with the graphic
   * frames, so a redundant text write sits ahead of the next real frame and
   * costs the reader latency.
   */
  private lastText: string | null = null;

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
  private shapeCache: { region: Element; shapes: SVGGraphicsElement[] } | null = null;

  private readonly disposables: Disposable[] = [];

  /**
   * @param display - Provides the chart's DOM root
   * @param braille - Supplies the braille on/off state this display mirrors
   * @param notification - Announces zoom, pan and connection changes
   * @param figure - The figure being displayed, for locating the active subplot
   */
  public constructor(
    display: DisplayService,
    braille: BrailleService,
    notification: NotificationService,
    figure: Figure,
  ) {
    this.display = display;
    this.braille = braille;
    this.notification = notification;
    this.figure = figure;

    this.disposables.push(braille.onToggle((event) => {
      if (event.enabled) {
        this.viewport?.reset();
        this.shapeCache = null;
        this.refresh();
      } else {
        this.blank();
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
    if (state.empty || state.type !== 'trace') {
      return;
    }
    this.lastState = state;
    if (!this.isActive) {
      return;
    }

    try {
      this.draw(state);
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
    if (this.lastState !== null) {
      this.update(this.lastState);
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
    this.refresh();
    this.notification.notify(viewport.describe());
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
    this.refresh();
    this.notification.notify(viewport.describe());
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
    const direction = KEY_PAN[key];
    if (direction !== undefined && this.isActive) {
      this.pan(direction);
    }
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
   * The chart's shapes, collected once per region and reused.
   * @param region - The element whose subtree holds the chart
   */
  private shapesOf(region: Element): SVGGraphicsElement[] {
    if (this.shapeCache !== null && this.shapeCache.region === region) {
      return this.shapeCache.shapes;
    }
    const shapes = TactileService.collectShapes(region);
    this.shapeCache = { region, shapes };
    return shapes;
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
   */
  private draw(state: NonEmptyTraceState): void {
    const geometry = dotPadSession.geometry;
    const region = this.findRegionElement();
    if (geometry === null || region === null) {
      return;
    }

    const source = TactileService.rectOf(region);
    if (source === null) {
      return;
    }

    if (this.viewport === null) {
      this.viewport = new TactileViewport(source, geometry.dotWidth, geometry.dotHeight);
    } else {
      this.viewport.setSource(source);
    }

    const focused = TactileService.focusedElements(state.highlight);

    // Follow the focus only when it has left the view. Recentring on every move
    // would keep overriding a pan the reader chose deliberately, while it still
    // showed what they were pointing at.
    const focusBounds = TactileService.boundsOf(focused);
    if (focusBounds !== null && !this.viewport.containsRect(focusBounds)) {
      this.viewport.centreOn(focusBounds);
    }

    const scene: TactileScene = {
      marks: this.shapesOf(region),
      focused,
      dataRegion: source,
    };

    const raster = TactileRenderer.render(
      scene,
      this.viewport,
      geometry.dotWidth,
      geometry.dotHeight,
    );

    this.send(raster, geometry.cellColumns, geometry.cellRows);
    this.sendText(state.text, geometry.textCells);
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
   */
  private send(raster: DotRaster, cellColumns: number, cellRows: number): void {
    const previous = this.lastRaster;
    if (previous !== null && previous.equals(raster)) {
      return;
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
  }

  /**
   * Formats one axis value for the text line.
   * @param value - The value as the trace reported it
   */
  private static formatValue(value: number | number[] | string | string[]): string {
    if (Array.isArray(value)) {
      return value.map(entry => TactileService.formatValue(entry)).join(' ');
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(Number.parseFloat(value.toFixed(4))) : '';
    }
    return value;
  }

  /**
   * Puts the focused point's values on the braille text line.
   *
   * Values only, without their axis labels. The labels do not change as the
   * reader navigates, so repeating them would spend most of a twenty-cell line
   * restating what the reader already knows; the labels are carried by speech
   * and by the braille panel instead.
   *
   * @param text - The focused point's labels and values
   * @param cellCount - Cells on the device's text line
   */
  private sendText(text: TextState, cellCount: number): void {
    if (cellCount <= 0) {
      return;
    }

    const parts = [
      TactileService.formatValue(text.main.value),
      TactileService.formatValue(text.cross.value),
    ];
    if (text.z !== undefined) {
      parts.push(TactileService.formatValue(text.z.value));
    }

    const cells = TactileBraille.toCells(parts.filter(part => part !== '').join(' '));
    const hex = DotPack.brailleCells(TactileBraille.window(cells, cellCount, 0), cellCount);
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
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    this.lastRaster = null;
    this.lastText = null;
    this.lastState = null;
    this.viewport = null;
    this.shapeCache = null;
  }
}
