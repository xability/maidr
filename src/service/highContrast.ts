import type { Context } from '@model/context';
import type { Figure } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import { PatternService } from '@service/pattern';
import { t } from '@util/i18n';

/**
 * Settings paths for high contrast configuration.
 */
enum HighContrastSettings {
  MODE = 'general.highContrastMode',
  LEVELS = 'general.highContrastLevels',
  LIGHT_COLOR = 'general.highContrastLightColor',
  DARK_COLOR = 'general.highContrastDarkColor',
}

/**
 * Constants for high contrast color calculations and visual effects.
 */
const HighContrastConstants = {
  // Luminance coefficients (ITU-R BT.709 standard for relative luminance)
  LUMINANCE_RED_COEFF: 0.299,
  LUMINANCE_GREEN_COEFF: 0.587,
  LUMINANCE_BLUE_COEFF: 0.114,

  // RGB channel values
  RGB_MAX_VALUE: 255,

  // Thresholds
  NEAR_WHITE_LUMINANCE_SCALE: 0.1,
  // A light grey that is not part of the data -- a gridline, an axis, a frame
  // -- is drawn faint on purpose, and is kept faint: the light colour at
  // reduced opacity, so it stays visible without competing with the data.
  LIGHT_GREY_LUMINANCE_SCALE: 0.25,
  GREY_MAX_CHANNEL_SPREAD: 24,
  FAINT_INK_ALPHA: 0.5,
  MIN_COMPLEX_PATH_LENGTH: 120,
  MIN_COLOR_INTERPOLATION_COUNT: 2,
  LIGHTNESS_MIDPOINT: 0.5,
  DEFAULT_MIDRANGE_LUMINANCE: 0.5,

  // Glow filter settings for line charts
  GLOW_FILTER_OFFSET: '-50%',
  GLOW_FILTER_SIZE: '200%',
  GLOW_BLUR_OUTER: 20,
  GLOW_BLUR_MIDDLE: 10,
  GLOW_BLUR_INNER: 5,

  // HSL conversion constants
  HSL_HUE_DIVISOR: 6,
  HSL_GREEN_HUE_OFFSET: 2,
  HSL_BLUE_HUE_OFFSET: 4,
  HSL_THRESHOLD_ONE_SIXTH: 1 / 6,
  HSL_THRESHOLD_ONE_HALF: 1 / 2,
  HSL_THRESHOLD_TWO_THIRDS: 2 / 3,
  HSL_THRESHOLD_ONE_THIRD: 1 / 3,
} as const;

/**
 * Trace types whose marks tile the plot and encode a value by their colour
 * alone -- a heat map cell, a choropleth region. Their paints keep mapping onto
 * the whole ramp, background colour included: a dark cell still reads against
 * its lighter neighbours, whereas lifting every cell off the background would
 * collapse the colour scale to a single value.
 */
const TILED_TRACE_TYPES: ReadonlySet<string> = new Set([
  'heat',
  'choropleth',
  'contour',
  'hexbin',
  // A letter-value plot nests its boxes, and tells the levels apart only by
  // shade.
  'boxen',
]);

/** Elements that draw text rather than a shape. */
const TEXT_TAGS: ReadonlySet<string> = new Set(['text', 'tspan', 'textPath']);

interface ElementColorInfo {
  element: SVGElement;
  /** The value as written, so it can be put back exactly. */
  color: string;
  /**
   * The colour the value paints, as the canvas serialises it (`#rrggbb`, or
   * `rgba(...)` with alpha), or `null` when it paints no solid colour --
   * `none`, a gradient or pattern `url(...)`, or a value that does not
   * resolve. A `var(...)` or `currentColor` is resolved through the cascade,
   * since the written value alone names no colour.
   */
  resolvedColor: string | null;
  /** The resolved colour after the luminance spread, when one applied. */
  spreadColor?: string;
  isInSelectors: boolean;
  cantBeBackground: boolean;
  attr: 'fill' | 'stroke';
  attrType?: 'style' | 'attribute';
}

/** An inline declaration this service overrode, and what it held before. */
interface InlineStyleSnapshot {
  element: HTMLElement | SVGElement;
  property: string;
  value: string;
  priority: string;
}

/**
 * HighContrastService manages the high contrast accessibility mode.
 *
 * Key behaviors:
 * - Captures original colors in constructor (before any transformations)
 * - Applies high contrast on focus-in via initializeHighContrast()
 * - Restores original colors on blur via suspendHighContrast()
 * - Responds to settings changes (toggle via keyboard/UI)
 */
export class HighContrastService implements Disposable {
  private readonly settingsService: SettingsService;
  private readonly notificationService: NotificationService;
  private readonly displayService: DisplayService;
  // Mutable: replaced in place on live data updates (see setFigure).
  private figure: Figure;
  private readonly context: Context;
  // Chart layers drawn outside the plot element but over it, which are
  // recoloured with it. See the constructor.
  private readonly getOverlayLayers: () => Element[];

  // Disposable for settings change subscription
  private settingsDisposable: Disposable | null = null;

  // Cached original colors - captured once on first application
  private defaultBackgroundColor: string = '';
  private defaultForegroundColor: string = '';
  private originalColorInfo: ElementColorInfo[] | null = null;

  // Inline declarations overridden while high contrast is painted: the
  // plot's own CSS background and the fill of text the captured colours do
  // not reach. Each is put back exactly as it was on restore.
  private inlineStyleSnapshots: InlineStyleSnapshot[] = [];

  // Taken with the original colours, so an apply never reads its own output:
  // the chart surfaces that paint a CSS background, and for each text element
  // without an inline fill, whether it was drawn near-white.
  private backgroundSurfaces: (HTMLElement | SVGElement)[] = [];
  private uncapturedTextIsPaper = new Map<SVGElement, boolean>();

  // Cache of all trace elements for high contrast mode
  private traceElementsCache: Set<SVGElement> | null = null;

  // Pattern service for high contrast mode patterns
  private patternService: PatternService | null = null;

  // Track previous high contrast mode state to detect changes
  private previousHighContrastMode: boolean = false;

  // Whether high contrast colors are currently painted onto the DOM. Distinct
  // from the setting: the effect is suspended on blur while the setting stays
  // on, so only this answers "is the DOM showing our colors right now?".
  private highContrastApplied: boolean = false;

  // Shared canvas context for color parsing (reused to avoid GC pressure)
  private sharedCanvasCtx: CanvasRenderingContext2D | null = null;

  /**
   * Returns a shared canvas 2D context for color parsing operations.
   * Creates the context on first use and reuses it to avoid GC pressure.
   */
  private getSharedCanvasContext(): CanvasRenderingContext2D | null {
    if (!this.sharedCanvasCtx) {
      this.sharedCanvasCtx = document.createElement('canvas').getContext('2d');
    }
    return this.sharedCanvasCtx;
  }

  // Computed getters that read from settings service (single source of truth)
  private get highContrastMode(): boolean {
    return this.settingsService.loadSettings().general.highContrastMode;
  }

  private get highContrastLightColor(): string {
    return this.settingsService.loadSettings().general.highContrastLightColor;
  }

  private get highContrastDarkColor(): string {
    return this.settingsService.loadSettings().general.highContrastDarkColor;
  }

  private get highContrastLevels(): number {
    return this.settingsService.loadSettings().general.highContrastLevels;
  }

  /**
   * Computed color equivalents based on current settings.
   * Interpolates between light and dark colors based on contrast levels.
   */
  private get colorEquivalents(): string[] {
    return this.interpolateColors(
      this.highContrastLightColor,
      this.highContrastDarkColor,
      this.highContrastLevels,
    );
  }

  public constructor(
    settings: SettingsService,
    notification: NotificationService,
    displayService: DisplayService,
    figure: Figure,
    context: Context,
    getOverlayLayers: () => Element[] = () => [],
  ) {
    this.settingsService = settings;
    this.notificationService = notification;
    this.displayService = displayService;
    this.figure = figure;
    this.context = context;
    // Some libraries draw part of the chart -- its title, axis titles, legend
    // -- into a separate SVG layered over the plot, outside the element maidr
    // focuses. Those layers sit on the same background, so they must change
    // with it. Asked for on each capture, since a library may redraw them.
    this.getOverlayLayers = getOverlayLayers;

    // Initialize previous state from settings to track changes
    this.previousHighContrastMode = this.highContrastMode;

    // Subscribe to settings changes using the modern event pattern
    this.settingsDisposable = this.settingsService.onChange((event) => {
      if (event.affectsSetting(HighContrastSettings.MODE)) {
        this.handleHighContrastModeChange(event.get<boolean>(HighContrastSettings.MODE));
      }
    });

    // IMPORTANT: Always capture original colors first, before any high contrast is applied.
    // The DOM has the true original colors at this point (page just loaded).
    // This ensures we have the correct colors for restoration.
    this.captureOriginalColors();

    // NOTE: We do NOT apply high contrast here in the constructor.
    // The first Controller created on page load is immediately disposed (see index.ts).
    // If we applied high contrast here, it would persist in the DOM but the Controller
    // (and its captured original colors) would be gone.
    //
    // High contrast will be applied when:
    // 1. The real Controller is created on focus-in (via initializeHighContrast)
    // 2. The user toggles high contrast mode via keyboard/settings
  }

  /**
   * Points this service at a rebuilt figure after a live data update and
   * re-captures original element colors. When high contrast is active, it is
   * re-applied to the new model's elements.
   *
   * @param figure - The replacement figure
   */
  public setFigure(figure: Figure): void {
    // A live update can arrive while high contrast is painted, and the capture
    // below reads the colors the DOM is showing. Restore first, or the
    // snapshot records this service's own output as the chart's originals and
    // turning high contrast off never gets the page back.
    const wasApplied = this.highContrastApplied;
    if (wasApplied) {
      this.restoreOriginalColors();
    }

    this.figure = figure;
    this.originalColorInfo = null;
    // Invalidate the trace-element cache so getAllTraceElements() rebuilds from
    // the new figure. Without this, colour classification would run against the
    // replaced figure's detached SVG elements and pin them in memory.
    this.traceElementsCache = null;
    this.captureOriginalColors();
    if (this.highContrastMode) {
      this.applyHighContrast();
    }
  }

  /**
   * Initialize high contrast mode after the Controller is fully set up.
   * Call this from the Controller after construction to apply high contrast if enabled.
   */
  public initializeHighContrast(): void {
    if (this.highContrastMode) {
      this.applyHighContrast();
    }
  }

  /**
   * Suspend high contrast mode visually (restore original colors).
   * Called on blur to return the chart to its original appearance.
   * The setting remains ON - this just hides the visual effect while unfocused.
   */
  public suspendHighContrast(): void {
    if (this.highContrastMode && this.originalColorInfo) {
      this.restoreOriginalColors();
    }
  }

  /**
   * Capture original colors from the DOM before any high contrast changes.
   */
  private captureOriginalColors(): void {
    // Capture the body's own inline declarations rather than its computed
    // colors. Writing a computed value back on restore would leave a
    // permanent inline style outranking the page's stylesheet, so a host
    // theme toggle would stop changing the body after one on/off cycle.
    this.defaultBackgroundColor = document.body.style.backgroundColor;
    this.defaultForegroundColor = document.body.style.color;

    // Capture SVG element colors
    this.originalColorInfo = this.getOriginalColorInfo();
    this.captureSurfacesAndText();
  }

  /**
   * Records what the inline overrides need to know about the chart as drawn.
   *
   * - A CSS background on the plot or an SVG inside it sits behind every
   *   mark. Plotly and Vega-Lite set one inline and Observable Plot from a
   *   stylesheet, so the computed value is what is checked.
   * - Text coloured by a stylesheet rule or by inheritance has no fill of its
   *   own to capture; its computed fill decides which end it takes.
   */
  private captureSurfacesAndText(): void {
    this.backgroundSurfaces = [];
    this.uncapturedTextIsPaper = new Map();

    const roots = this.getColorRoots();
    const surfaces = roots.flatMap(root => [
      root as HTMLElement | SVGElement,
      ...Array.from(root.querySelectorAll('svg')),
    ]);
    for (const surface of surfaces) {
      const background = this.parseCssColor(window.getComputedStyle(surface).backgroundColor);
      const parts = background === null ? null : this.splitAlpha(background);
      if (parts !== null && parts.alpha > 0) {
        this.backgroundSurfaces.push(surface);
      }
    }

    const textElements = roots.flatMap(root =>
      Array.from(root.querySelectorAll<SVGElement>('text, tspan, textPath')));
    for (const text of textElements) {
      if (text.style.getPropertyValue('fill') !== '' || text.hasAttribute('fill')) {
        // Captured with the other colours.
        continue;
      }
      const computedFill = window.getComputedStyle(text).getPropertyValue('fill');
      const parent = text.parentElement;
      if (
        text.tagName !== 'text'
        && parent !== null
        && window.getComputedStyle(parent).getPropertyValue('fill') === computedFill
      ) {
        // A span that takes its colour from its <text> follows it there.
        continue;
      }
      const fill = this.resolvePaint(text, 'fill', computedFill);
      const parts = fill === null ? null : this.splitAlpha(fill);
      this.uncapturedTextIsPaper.set(
        text,
        parts !== null
        && !this.isTiledChart()
        && this.isNearWhite(parts.hex, HighContrastConstants.NEAR_WHITE_LUMINANCE_SCALE),
      );
    }
  }

  /**
   * Validates that captured elements still exist in the DOM.
   * Returns true if all elements are valid, false if any are stale/removed.
   */
  private validateCapturedElements(): boolean {
    if (!this.originalColorInfo || this.originalColorInfo.length === 0) {
      return false;
    }

    return this.originalColorInfo.every(
      info => info.element && document.body.contains(info.element),
    );
  }

  /**
   * Re-captures original colors if DOM has changed since initial capture.
   * Call this before applying high contrast to ensure color data is fresh.
   */
  private recaptureIfNeeded(): void {
    if (!this.validateCapturedElements()) {
      console.warn(
        'HighContrastService: DOM changed since capture, re-capturing colors',
      );
      this.captureOriginalColors();
    }
  }

  public dispose(): void {
    // Unsubscribe from settings changes
    if (this.settingsDisposable) {
      this.settingsDisposable.dispose();
      this.settingsDisposable = null;
    }

    // Clean up pattern service if exists
    if (this.patternService) {
      this.patternService.dispose();
      this.patternService = null;
    }

    // The parsing canvas outlives nothing else here, but release it for the
    // same reason PatternService does: a disposed service should not keep a
    // rendering context alive if anything still holds a reference to it.
    this.sharedCanvasCtx = null;

    // Note: Colors are restored via suspendHighContrast() before dispose is called.
    // See index.ts onFocusOut handler.
  }

  /**
   * Handle high contrast mode setting change.
   * Called when user toggles high contrast via keyboard or settings UI.
   */
  private handleHighContrastModeChange(newHighContrastMode: boolean): void {
    // Only act if high contrast mode actually changed
    if (newHighContrastMode !== this.previousHighContrastMode) {
      this.previousHighContrastMode = newHighContrastMode;

      if (newHighContrastMode) {
        this.applyHighContrast();
      } else {
        this.restoreOriginalColors();
      }
    }
  }

  /**
   * Toggle high contrast mode on/off.
   * Called from keyboard shortcut (C key).
   */
  public toggleHighContrast(): void {
    const currentSettings = this.settingsService.loadSettings();
    const newHighContrastMode = !currentSettings.general.highContrastMode;

    // Update settings through the settings service (persists and notifies observers)
    this.settingsService.saveSettings({
      ...currentSettings,
      general: {
        ...currentSettings.general,
        highContrastMode: newHighContrastMode,
      },
    });

    // The update() method will be called via observer pattern to apply/restore colors

    const message = t(newHighContrastMode ? 'notification.highContrastOn' : 'notification.highContrastOff');
    this.notificationService.notify(message);
  }

  /**
   * Apply high contrast colors to all elements.
   */
  private applyHighContrast(): void {
    // Validate and re-capture colors if DOM has changed
    this.recaptureIfNeeded();

    // Apply body styles
    document.body.style.backgroundColor = this.highContrastDarkColor;
    document.body.style.color = this.highContrastLightColor;

    // Whether an element sits under a text group is asked once per captured
    // fill or stroke below and again for the glow filter. One memo per apply
    // keeps the ancestor walk to one per element.
    const textDescendants = new Map<Element, boolean>();

    // Get high contrast colors for all elements
    const highContrastElInfo = this.getHighContrastColors(textDescendants);

    // Apply high contrast colors to elements
    for (const item of highContrastElInfo) {
      if (item.element && item.attrType === 'style') {
        const style = item.element.getAttribute('style') || '';
        const newStyle = style.replace(
          new RegExp(`${item.attr}:\\s*[^;]+`, 'i'),
          `${item.attr}:${item.color}`,
        );
        item.element.setAttribute('style', newStyle);
      } else if (item.element && item.attrType === 'attribute') {
        item.element.setAttribute(item.attr, item.color);
      }
    }

    this.overrideInlineStyles();

    // Add text shadow filter
    const hasGlowFilter = this.addGlowShadowFilter();

    // Apply shadow to text elements. An element that already carries a filter
    // of its own keeps it: restore removes only the glow, so overwriting the
    // page's filter here would lose it for good.
    //
    // The glow is for glyphs drawn as paths (matplotlib's text), which have no
    // outline of their own to lift them off a light mark. A <text> element is
    // left alone -- libraries that need it draw their own halo, and a glow over
    // that smears the label -- except on a tiled chart, where a label may land
    // on a cell of either shade and has only the glow to stand out.
    if (hasGlowFilter) {
      const tiled = this.isTiledChart();
      const glow = (element: SVGElement): void => {
        if (!element.hasAttribute('filter')) {
          element.setAttribute('filter', 'url(#glow-shadow)');
        }
      };
      for (const item of highContrastElInfo) {
        if (
          item.attr === 'fill'
          && item.color === this.highContrastLightColor
          && (tiled || !TEXT_TAGS.has(item.element.tagName))
          && this.isTextDescendant(item.element, textDescendants)
        ) {
          glow(item.element);
        }
      }
      if (tiled) {
        for (const text of this.uncapturedTextIsPaper.keys()) {
          glow(text);
        }
      }
    }

    // Handle line chart exception. Step charts render as the same kind of
    // stroked polyline, so they need the same treatment.
    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'line'
        || this.context.instructionContext.type === 'step'
      ) {
        document.getElementById(this.context.id)?.classList.add('high-contrast');
      }
    }

    // Apply plot fill style. Set only the `fill` property so any other inline
    // styles on the plot element (e.g. React's `width: fit-content`) are preserved.
    this.displayService.plot.style.setProperty('fill', this.highContrastLightColor);

    // Handle stacked/dodged/normalized bar, mosaic and pie exceptions: apply
    // patterns.
    //
    // These are the chart types whose marks touch each other, so the boundary
    // between two of them is carried by their fill alone. High contrast then
    // pushes neighbouring fills toward the same end of the ramp and the marks
    // merge into one shape — adjacent pie wedges of a similar hue are the worst
    // case, since a pie is nothing but touching marks. A distinct pattern per
    // original fill keeps them separable without relying on colour.
    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'stacked_bar'
        || this.context.instructionContext.type === 'dodged_bar'
        || this.context.instructionContext.type === 'pie'
        || this.context.instructionContext.type === 'stacked_normalized_bar'
        || this.context.instructionContext.type === 'mosaic'
      ) {
        this.applyPatternsToElements(highContrastElInfo);
      }
    }

    this.highContrastApplied = true;
  }

  /**
   * Restore original colors when turning off high contrast.
   */
  private restoreOriginalColors(): void {
    if (!this.originalColorInfo) {
      return;
    }

    // Restore body styles
    this.restoreBodyStyle('background-color', this.defaultBackgroundColor);
    this.restoreBodyStyle('color', this.defaultForegroundColor);

    this.restoreInlineStyles();

    // Restore SVG element colors
    this.originalColorInfo.forEach((item) => {
      if (item.element && item.attrType === 'style') {
        const style = item.element.getAttribute('style') || '';
        const newStyle = style.replace(
          new RegExp(`${item.attr}:\\s*[^;]+`, 'i'),
          `${item.attr}:${item.color}`,
        );
        item.element.setAttribute('style', newStyle);
      } else if (item.element && item.attrType === 'attribute') {
        item.element.setAttribute(item.attr, item.color);
      }
    });

    // Remove the text shadow filter from everything it was given to.
    for (const root of this.getColorRoots()) {
      for (const element of root.querySelectorAll('[filter="url(#glow-shadow)"]')) {
        element.removeAttribute('filter');
      }
    }

    // Handle line chart exception. Mirrors the add path above, including step.
    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'line'
        || this.context.instructionContext.type === 'step'
      ) {
        document
          .getElementById(this.context.id)
          ?.classList
          .remove('high-contrast');
      }
    }

    // Restore plot fill style by removing only the `fill` property we set,
    // leaving all other inline styles on the plot element intact.
    this.displayService.plot.style.removeProperty('fill');

    // The glow filter was added for the text; nothing refers to it any more.
    this.getPlotSvg()?.querySelector('#glow-shadow')?.remove();

    // Clean up pattern service
    if (this.patternService) {
      this.patternService.dispose();
      this.patternService = null;
    }

    this.highContrastApplied = false;
  }

  // ========== Helper Methods ==========

  /**
   * Puts one body color declaration back the way it was found. An empty
   * captured value means the page declared nothing inline, so the property is
   * removed rather than pinned to whatever it computed to.
   */
  private restoreBodyStyle(property: string, value: string): void {
    if (value === '') {
      document.body.style.removeProperty(property);
    } else {
      document.body.style.setProperty(property, value);
    }
  }

  /**
   * The `<svg>` the chart draws into. The plot element is usually that SVG,
   * but can be an HTML wrapper around it, and definitions a fill or filter
   * refers to must live inside the SVG: a `<pattern>` or `<filter>` placed in
   * the wrapper renders nothing, so every mark using it disappears.
   */
  private getPlotSvg(): SVGSVGElement | null {
    const plot = this.displayService.plot;
    if (plot instanceof SVGSVGElement) {
      return plot;
    }
    return plot.querySelector('svg');
  }

  /**
   * Overrides the inline declarations the captured fills and strokes cannot
   * reach, recording each so restore can put it back: the chart's CSS
   * background, and the fill of text coloured by a stylesheet rule -- which
   * outranks both a fill attribute and the colour set on the plot, where an
   * inline declaration outranks it.
   */
  private overrideInlineStyles(): void {
    this.restoreInlineStyles();

    for (const surface of this.backgroundSurfaces) {
      this.overrideInlineStyle(surface, 'background-color', this.highContrastDarkColor);
    }

    for (const [text, isPaper] of this.uncapturedTextIsPaper) {
      this.overrideInlineStyle(
        text,
        'fill',
        isPaper ? this.highContrastDarkColor : this.highContrastLightColor,
      );
    }
  }

  private overrideInlineStyle(
    element: HTMLElement | SVGElement,
    property: string,
    value: string,
  ): void {
    this.inlineStyleSnapshots.push({
      element,
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
    element.style.setProperty(property, value);
  }

  private restoreInlineStyles(): void {
    for (const snapshot of this.inlineStyleSnapshots) {
      if (snapshot.value === '') {
        snapshot.element.style.removeProperty(snapshot.property);
      } else {
        snapshot.element.style.setProperty(snapshot.property, snapshot.value, snapshot.priority);
      }
    }
    this.inlineStyleSnapshots = [];
  }

  /**
   * Get all SVG elements from all traces in the Figure hierarchy.
   */
  private getAllTraceElements(): Set<SVGElement> {
    if (this.traceElementsCache !== null) {
      return this.traceElementsCache;
    }

    const elements = new Set<SVGElement>();

    for (const subplotRow of this.figure.subplots) {
      for (const subplot of subplotRow) {
        for (const traceRow of subplot.traces) {
          for (const trace of traceRow) {
            const traceElements = trace.getAllOriginalElements();
            for (const el of traceElements) {
              elements.add(el);
            }
          }
        }
      }
    }

    this.traceElementsCache = elements;
    return elements;
  }

  private isTraceElement(
    element: Element,
    traceElements: Set<SVGElement>,
  ): boolean {
    return traceElements.has(element as SVGElement);
  }

  /**
   * The plot element and any overlay layers drawn over it, each of which is
   * recoloured as a whole.
   */
  private getColorRoots(): Element[] {
    return [this.displayService.plot, ...this.getOverlayLayers()];
  }

  private getOriginalColorInfo(): ElementColorInfo[] | null {
    if (!this.displayService.plot)
      return null;
    const svgElements = this.getColorRoots().flatMap(root =>
      Array.from(root.querySelectorAll('*')));

    const traceElements = this.getAllTraceElements();
    const originalColorInfo: ElementColorInfo[] = [];

    for (let i = 0; i < svgElements.length; i++) {
      const el = svgElements[i];

      if (el.getAttribute('visibility') === 'hidden') {
        continue;
      }

      const style = el.getAttribute('style') || '';
      const styleFillMatch = style.match(/fill:\s*([^;]+)/i);
      const styleStrokeMatch = style.match(/stroke:\s*([^;]+)/i);

      const isInSelectors = this.isTraceElement(el, traceElements);

      const complexPath = el.getAttribute('d');
      let isComplexPath = false;
      if (complexPath) {
        isComplexPath
          = complexPath.length > HighContrastConstants.MIN_COMPLEX_PATH_LENGTH;
      }
      const cantBeBackground = isComplexPath;

      const capture = (
        value: string,
        attr: 'fill' | 'stroke',
        attrType: 'style' | 'attribute',
      ): void => {
        const color = value.trim();
        originalColorInfo.push({
          element: el as SVGElement,
          color,
          resolvedColor: this.resolvePaint(el, attr, color),
          isInSelectors,
          cantBeBackground,
          attr,
          attrType,
        });
      };

      if (styleFillMatch) {
        capture(styleFillMatch[1], 'fill', 'style');
      }
      if (styleStrokeMatch) {
        capture(styleStrokeMatch[1], 'stroke', 'style');
      }

      const attrFill = el.getAttribute('fill');
      if (attrFill) {
        capture(attrFill, 'fill', 'attribute');
      }
      const attrStroke = el.getAttribute('stroke');
      if (attrStroke) {
        capture(attrStroke, 'stroke', 'attribute');
      }
    }

    return originalColorInfo;
  }

  private getHighContrastColors(
    textDescendants: Map<Element, boolean>,
  ): ElementColorInfo[] {
    const originalColorInfo = this.originalColorInfo;
    if (!originalColorInfo)
      return [];

    const spreadColors
      = this.spreadColorsAcrossLuminanceSpectrum(originalColorInfo);

    // The ramp depends only on the settings, so interpolate it once here
    // rather than per captured color: each interpolation parses two colors
    // through the canvas and rebuilds the whole array.
    const colorEquivalents = this.colorEquivalents;

    const highContrastElInfo = spreadColors.map(item => ({
      ...item,
      color: this.toColorStep(item, colorEquivalents, textDescendants),
    }));

    this.keepShapesVisible(highContrastElInfo, textDescendants);

    return highContrastElInfo;
  }

  /**
   * Makes sure no shape the chart drew in ink is left entirely in the
   * background colour.
   *
   * Mapping each paint on its own is right for a shape with an outline: a
   * light fill going dark behind an outline going light reads as the same
   * shape, hollow, and keeps what is drawn inside it -- a box plot's median
   * -- visible. A shape with no light paint left, though, vanishes into the
   * page. That shape gets its fill lifted to the light colour; when the fill
   * was the paper showing through (a hollow marker), its outline instead.
   * A tiled chart is exempt, since a dark cell reads against its neighbours.
   */
  private keepShapesVisible(
    items: ElementColorInfo[],
    textDescendants: Map<Element, boolean>,
  ): void {
    if (this.isTiledChart()) {
      return;
    }

    const byElement = new Map<SVGElement, ElementColorInfo[]>();
    for (const item of items) {
      if (item.resolvedColor === null || this.isTextDescendant(item.element, textDescendants)) {
        continue;
      }
      const paints = byElement.get(item.element) ?? [];
      paints.push(item);
      byElement.set(item.element, paints);
    }

    const isBackground = (item: ElementColorInfo): boolean => {
      const parts = this.splitAlpha(this.parseCssColor(item.color) ?? '');
      return parts !== null && parts.hex === this.parseCssColor(this.highContrastDarkColor);
    };

    // An outline only shows if it has width; Plotly sets a stroke colour on
    // every bar and draws it at zero width. A width that cannot be read is
    // taken as the default of one.
    const isVisible = (item: ElementColorInfo): boolean => {
      if (item.attr === 'fill') {
        return true;
      }
      const width = Number.parseFloat(window.getComputedStyle(item.element).strokeWidth);
      return Number.isNaN(width) || width > 0;
    };

    for (const [element, paints] of byElement) {
      const ink = paints.filter(item => !this.isPaperPaint(item));
      if (ink.length === 0 || paints.some(item => !isBackground(item) && isVisible(item))) {
        continue;
      }
      if (element.getAttribute('visibility') === 'hidden') {
        continue;
      }

      const fill = paints.find(item => item.attr === 'fill');
      const stroke = paints.find(item => item.attr === 'stroke');
      const lift = fill !== undefined && !this.isPaperPaint(fill)
        ? fill
        : stroke ?? fill;
      if (!lift) {
        continue;
      }
      const alpha = this.splitAlpha(lift.resolvedColor ?? '')?.alpha ?? 1;
      lift.color = this.applyAlpha(this.highContrastLightColor, alpha);
    }
  }

  /**
   * Whether a paint is paper rather than ink: the near-white of the page
   * showing through, or a faint grey area outside the data -- a panel or plot
   * background. The same test toColorStep sends to the background colour.
   */
  private isPaperPaint(item: ElementColorInfo): boolean {
    const parts = this.splitAlpha(item.resolvedColor ?? '');
    if (parts === null) {
      return false;
    }
    return this.isNearWhite(parts.hex, HighContrastConstants.NEAR_WHITE_LUMINANCE_SCALE)
      || (!item.isInSelectors && item.attr === 'fill' && this.isLightGrey(parts.hex));
  }

  /**
   * A paint of the colour field on a tiled chart: a mark the trace selects,
   * or any other area filled in colour -- a contour band is drawn as an area
   * but only its outline is selected.
   */
  private isTiledMark(item: ElementColorInfo): boolean {
    if (!this.isTiledChart()) {
      return false;
    }
    if (item.isInSelectors) {
      return true;
    }
    if (item.attr !== 'fill') {
      return false;
    }
    const parts = this.splitAlpha(item.resolvedColor ?? '');
    return parts !== null
      && !this.isNearWhite(parts.hex, HighContrastConstants.NEAR_WHITE_LUMINANCE_SCALE)
      && !this.isLightGrey(parts.hex);
  }

  private isTiledChart(): boolean {
    return 'type' in this.context.instructionContext
      && TILED_TRACE_TYPES.has(String(this.context.instructionContext.type));
  }

  /**
   * Memoised form of the "is this element inside a text group?" question.
   * The answer is fixed for the duration of one apply, and the walk is asked
   * for the same element several times over.
   */
  private isTextDescendant(
    element: Element,
    textDescendants: Map<Element, boolean>,
  ): boolean {
    const cached = textDescendants.get(element);
    if (cached !== undefined) {
      return cached;
    }

    const isText = TEXT_TAGS.has(element.tagName) || this.hasTextAncestor(element);
    textDescendants.set(element, isText);
    return isText;
  }

  /**
   * Whether an element is drawn as part of a piece of text: inside a
   * `<text>`, or inside a group whose id starts with `text` -- how matplotlib
   * groups the glyph paths it draws text with.
   */
  private hasTextAncestor(el: Element): boolean {
    let current = el.parentElement;

    while (current) {
      if (current.tagName === 'svg' || current.tagName === 'BODY') {
        break;
      }

      if (TEXT_TAGS.has(current.tagName) || current.id.startsWith('text')) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  /**
   * Adds the glow filter the text is given, and reports whether the chart
   * has one to refer to.
   */
  private addGlowShadowFilter(): boolean {
    const svg = this.getPlotSvg();
    if (!svg) {
      return false;
    }

    if (svg.querySelector('#glow-shadow')) {
      return true;
    }

    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    const filter = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'filter',
    );
    filter.setAttribute('id', 'glow-shadow');
    filter.setAttribute('x', HighContrastConstants.GLOW_FILTER_OFFSET);
    filter.setAttribute('y', HighContrastConstants.GLOW_FILTER_OFFSET);
    filter.setAttribute('width', HighContrastConstants.GLOW_FILTER_SIZE);
    filter.setAttribute('height', HighContrastConstants.GLOW_FILTER_SIZE);

    const filterHTML = `
    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_OUTER}" result="blur1"/>
    <feOffset dx="0" dy="0" result="offsetblur1" in="blur1"/>
    <feFlood flood-color="black" result="color1"/>
    <feComposite in="color1" in2="offsetblur1" operator="in" result="shadow1"/>

    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_MIDDLE}" result="blur2"/>
    <feOffset dx="0" dy="0" result="offsetblur2" in="blur2"/>
    <feFlood flood-color="black" result="color2"/>
    <feComposite in="color2" in2="offsetblur2" operator="in" result="shadow2"/>

    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_MIDDLE}" result="blur3"/>
    <feOffset dx="0" dy="0" result="offsetblur3" in="blur3"/>
    <feFlood flood-color="black" result="color3"/>
    <feComposite in="color3" in2="offsetblur3" operator="in" result="shadow3"/>

    <feGaussianBlur in="SourceAlpha" stdDeviation="${HighContrastConstants.GLOW_BLUR_INNER}" result="blur4"/>
    <feOffset dx="0" dy="0" result="offsetblur4" in="blur4"/>
    <feFlood flood-color="black" result="color4"/>
    <feComposite in="color4" in2="offsetblur4" operator="in" result="shadow4"/>

    <feMerge>
      <feMergeNode in="shadow1"/>
      <feMergeNode in="shadow2"/>
      <feMergeNode in="shadow3"/>
      <feMergeNode in="shadow4"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `;

    filter.innerHTML = filterHTML;
    defs.appendChild(filter);
    return true;
  }

  private toColorStep(
    colorInfo: ElementColorInfo,
    colorEquivalents: string[],
    textDescendants: Map<Element, boolean>,
  ): string {
    const value = colorInfo.color;
    if (colorInfo.resolvedColor === null) {
      // Nothing solid to map: `none`, a gradient or pattern, or a value that
      // does not resolve. Leave it as the chart drew it.
      return value;
    }

    const original = this.splitAlpha(colorInfo.resolvedColor);
    if (original === null) {
      return value;
    }
    // The mapping is decided on the colour itself and the result keeps the
    // original opacity: a translucent band stays translucent, and a hit area
    // drawn at near-zero opacity stays invisible rather than turning solid.
    const withAlpha = (hex: string): string => this.applyAlpha(hex, original.alpha);

    const nearWhiteScale = HighContrastConstants.NEAR_WHITE_LUMINANCE_SCALE;
    const isPaper = this.isNearWhite(original.hex, nearWhiteScale);

    if (this.isTextDescendant(colorInfo.element, textDescendants)) {
      // Text sits on the page, and reads light on the dark background --
      // unless it was drawn near-white, which a label only is when it sits on
      // a coloured mark. That mark turns light, so the label turns dark. A
      // halo drawn around text follows the same rule, and so stays opposite
      // to the glyphs it separates.
      //
      // On a tiled chart a cell may map to either end, so a label cannot know
      // what it will sit on; it stays light, and the glow lifts it off a light
      // cell.
      return withAlpha(isPaper && !this.isTiledChart()
        ? this.highContrastDarkColor
        : this.highContrastLightColor);
    }

    const hex = colorInfo.spreadColor ?? original.hex;

    const traceType: string | undefined = 'type' in this.context.instructionContext
      ? String(this.context.instructionContext.type)
      : undefined;
    const isBarLike = traceType === 'bar' || traceType === 'hist';
    const useNearWhite = isBarLike && colorInfo.isInSelectors;

    if (!this.isTiledMark(colorInfo)) {
      // A near-white paint is the paper showing through -- the chart's
      // background, the hollow of a box or marker, the gap drawn between
      // touching bars and wedges -- and becomes the background, so the shapes
      // around it stay apart. A bar's own near-white fill is still a bar.
      if (isPaper) {
        return withAlpha(useNearWhite && colorInfo.attr === 'fill'
          ? this.highContrastLightColor
          : this.highContrastDarkColor);
      }

      if (!colorInfo.isInSelectors && this.isLightGrey(original.hex)) {
        // A faint grey line -- a gridline, an axis, a frame -- stays, faint. A
        // faint grey area is a panel or plot background, and is paper.
        return colorInfo.attr === 'stroke'
          ? this.applyAlpha(this.highContrastLightColor, original.alpha * HighContrastConstants.FAINT_INK_ALPHA)
          : withAlpha(this.highContrastDarkColor);
      }
    }

    // Any other paint maps across the ramp; keepShapesVisible then lifts any
    // shape this leaves wholly in the background colour.
    return withAlpha(this.findClosestColor(
      hex,
      colorEquivalents,
      useNearWhite,
      nearWhiteScale,
      // A long path must not vanish as a line, but a tiled area is read
      // against its neighbours whichever end it takes.
      colorInfo.cantBeBackground && !(this.isTiledMark(colorInfo) && colorInfo.attr === 'fill'),
    ));
  }

  /**
   * Resolves the colour a fill or stroke paints. The written value is used
   * when it is a colour; a `var(...)`, `currentColor` or `inherit` names none
   * by itself, so the element's computed value is read instead.
   *
   * @returns The canvas-serialised colour, or `null` when the paint is not a
   *   solid colour.
   */
  private resolvePaint(
    element: Element,
    attr: 'fill' | 'stroke',
    value: string,
  ): string | null {
    if (value === 'none' || value === 'transparent') {
      return null;
    }

    const parsed = this.parseCssColor(value);
    if (parsed !== null) {
      return parsed;
    }

    if (value.startsWith('url(')) {
      return null;
    }

    const computed = window.getComputedStyle(element).getPropertyValue(attr).trim();
    return computed === '' ? null : this.parseCssColor(computed);
  }

  /**
   * Serialises a CSS colour through the shared canvas.
   *
   * Assigning a value the canvas cannot parse leaves `fillStyle` untouched, so
   * the value is assigned over two different colours: when both reads agree
   * it parsed, and when they differ it did not.
   *
   * @returns `#rrggbb`, `rgba(...)` for a colour with alpha, or `null`.
   */
  private parseCssColor(value: string): string | null {
    const ctx = this.getSharedCanvasContext();
    if (!ctx) {
      return null;
    }

    const trimmed = value.trim();
    const srgb = this.fromSrgbFunction(trimmed);
    if (srgb !== null) {
      return srgb;
    }

    ctx.fillStyle = '#000000';
    ctx.fillStyle = trimmed;
    const overBlack = String(ctx.fillStyle);
    ctx.fillStyle = '#ffffff';
    ctx.fillStyle = trimmed;
    const overWhite = String(ctx.fillStyle);

    if (overBlack !== overWhite) {
      return null;
    }
    return this.fromSrgbFunction(overBlack) ?? overBlack;
  }

  /**
   * Converts a `color(srgb r g b [/ a])` value to `#rrggbb` or `rgba(...)`.
   * A computed style reports a colour in that form when the page wrote it with
   * relative colour syntax (Highcharts does), and the canvas passes it through
   * unchanged rather than serialising it.
   *
   * @returns The converted colour, or `null` when the value is in another form.
   */
  private fromSrgbFunction(value: string): string | null {
    const match = value.match(
      /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\s*\)$/i,
    );
    if (!match) {
      return null;
    }
    const channel = (component: string): number => Math.round(
      Math.max(0, Math.min(1, Number.parseFloat(component))) * HighContrastConstants.RGB_MAX_VALUE,
    );
    const hex = this.rgbToHex({ r: channel(match[1]), g: channel(match[2]), b: channel(match[3]) });
    const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
    return this.applyAlpha(hex, alpha);
  }

  /**
   * Splits a canvas-serialised colour into its opaque `#rrggbb` and its alpha.
   *
   * @returns The parts, or `null` for a format the canvas does not produce.
   */
  private splitAlpha(color: string): { hex: string; alpha: number } | null {
    if (/^#[0-9a-f]{6}$/i.test(color)) {
      return { hex: color.toLowerCase(), alpha: 1 };
    }

    const rgba = color.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/i);
    if (!rgba) {
      return null;
    }

    return {
      hex: this.rgbToHex({
        r: Number.parseInt(rgba[1], 10),
        g: Number.parseInt(rgba[2], 10),
        b: Number.parseInt(rgba[3], 10),
      }),
      alpha: Number.parseFloat(rgba[4]),
    };
  }

  /**
   * Gives a ramp colour the opacity of the paint it replaces.
   */
  private applyAlpha(color: string, alpha: number): string {
    if (alpha >= 1) {
      return color;
    }
    const rgb = this.parseColorToRgb(color);
    if (!rgb) {
      return color;
    }
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  /**
   * A light, colourless paint: the faint grey of a gridline or frame.
   */
  private isLightGrey(hex: string): boolean {
    const rgb = this.parseColorToRgb(hex);
    if (!rgb) {
      return false;
    }
    const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    return spread <= HighContrastConstants.GREY_MAX_CHANNEL_SPREAD
      && this.isNearWhite(hex, HighContrastConstants.LIGHT_GREY_LUMINANCE_SCALE);
  }

  private isNearWhite(hex: string, nearWhiteScale: number): boolean {
    const rgb = this.parseColorToRgb(hex);
    if (!rgb) {
      return false;
    }
    const luminance
      = HighContrastConstants.LUMINANCE_RED_COEFF * rgb.r
        + HighContrastConstants.LUMINANCE_GREEN_COEFF * rgb.g
        + HighContrastConstants.LUMINANCE_BLUE_COEFF * rgb.b;
    return luminance >= HighContrastConstants.RGB_MAX_VALUE * (1 - nearWhiteScale);
  }

  private findClosestColor(
    inputColor: string,
    colorArray: string[],
    useNearWhite: boolean,
    nearWhiteScale: number,
    cantBeBackground: boolean,
  ): string {
    if (colorArray.length === 0) {
      throw new Error('Color array cannot be empty');
    }

    const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
      const normalized = hex.replace('#', '');
      return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
      };
    };

    const getLuminance = (rgb: { r: number; g: number; b: number }): number => {
      return (
        HighContrastConstants.LUMINANCE_RED_COEFF * rgb.r
        + HighContrastConstants.LUMINANCE_GREEN_COEFF * rgb.g
        + HighContrastConstants.LUMINANCE_BLUE_COEFF * rgb.b
      );
    };

    const colorDistance = (
      c1: { r: number; g: number; b: number },
      c2: { r: number; g: number; b: number },
    ): number => {
      return Math.sqrt(
        (c1.r - c2.r) ** 2
        + (c1.g - c2.g) ** 2
        + (c1.b - c2.b) ** 2,
      );
    };

    const inputRgb = hexToRgb(inputColor);

    // The caller's ramp is shared across every color of one apply, so drop the
    // background from a copy rather than from the array itself.
    let colors = colorArray;
    if (cantBeBackground) {
      const backgroundIndex = colors.indexOf(this.highContrastDarkColor);
      if (backgroundIndex !== -1) {
        colors = colors.filter((_, index) => index !== backgroundIndex);
      }
    }

    if (useNearWhite) {
      const inputLuminance = getLuminance(inputRgb);
      const nearWhiteThreshold
        = HighContrastConstants.RGB_MAX_VALUE * (1 - nearWhiteScale);

      if (inputLuminance >= nearWhiteThreshold) {
        return colors[0];
      }

      let closestColor = colors[0];
      let minDistance = colorDistance(inputRgb, hexToRgb(colors[0]));

      for (let i = 1; i < colors.length; i++) {
        const distance = colorDistance(inputRgb, hexToRgb(colors[i]));
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = colors[i];
        }
      }

      return closestColor;
    } else {
      let closestColor = colors[0];
      let minDistance = colorDistance(inputRgb, hexToRgb(colors[0]));

      for (let i = 1; i < colors.length; i++) {
        const distance = colorDistance(inputRgb, hexToRgb(colors[i]));
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = colors[i];
        }
      }

      const index = colors.indexOf(closestColor);
      const reversedIndex = colors.length - 1 - index;
      return colors[reversedIndex];
    }
  }

  public interpolateColors(
    startColor: string,
    endColor: string,
    count: number,
  ): string[] {
    const numColors = Math.max(2, Math.floor(count));

    const startRgb = this.parseColorToRgb(startColor);
    const endRgb = this.parseColorToRgb(endColor);

    if (!startRgb || !endRgb) {
      return [startColor, endColor];
    }

    if (numColors === 2) {
      return [startColor, endColor];
    }

    const colors: string[] = [];

    const interpolateAt = (t: number): string => {
      const r = Math.round(startRgb.r + t * (endRgb.r - startRgb.r));
      const g = Math.round(startRgb.g + t * (endRgb.g - startRgb.g));
      const b = Math.round(startRgb.b + t * (endRgb.b - startRgb.b));
      return this.rgbToHex({ r, g, b });
    };

    for (let i = 0; i < numColors; i++) {
      const t = i / (numColors - 1);
      colors.push(interpolateAt(t));
    }

    return colors;
  }

  private parseColorToRgb(
    color: string,
  ): { r: number; g: number; b: number } | null {
    const trimmed = color.trim();

    const ctx = this.getSharedCanvasContext();
    if (!ctx)
      return null;

    ctx.fillStyle = '#000';
    ctx.fillStyle = trimmed;
    const hex = ctx.fillStyle;

    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: Number.parseInt(hex.slice(1, 3), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        b: Number.parseInt(hex.slice(5, 7), 16),
      };
    }

    return null;
  }

  private rgbToHex(rgb: { r: number; g: number; b: number }): string {
    const toHex = (n: number): string => {
      const clamped = Math.max(0, Math.min(HighContrastConstants.RGB_MAX_VALUE, n));
      return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  private normalizeColor(color: string): string {
    const ctx = this.getSharedCanvasContext();
    if (!ctx)
      return color.toLowerCase().replace(/\s/g, '');

    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    return ctx.fillStyle.toLowerCase();
  }

  private spreadColorsAcrossLuminanceSpectrum(
    colorInfos: ElementColorInfo[],
  ): ElementColorInfo[] {
    const rgbToHsl = (rgb: {
      r: number;
      g: number;
      b: number;
    }): { h: number; s: number; l: number } => {
      const r = rgb.r / HighContrastConstants.RGB_MAX_VALUE;
      const g = rgb.g / HighContrastConstants.RGB_MAX_VALUE;
      const b = rgb.b / HighContrastConstants.RGB_MAX_VALUE;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      if (max === min) {
        return { h: 0, s: 0, l };
      }

      const d = max - min;
      const s
        = l > HighContrastConstants.LIGHTNESS_MIDPOINT
          ? d / (2 - max - min)
          : d / (max + min);

      let h = 0;
      if (max === r) {
        h
          = ((g - b) / d
            + (g < b ? HighContrastConstants.HSL_HUE_DIVISOR : 0))
          / HighContrastConstants.HSL_HUE_DIVISOR;
      } else if (max === g) {
        h
          = ((b - r) / d + HighContrastConstants.HSL_GREEN_HUE_OFFSET)
            / HighContrastConstants.HSL_HUE_DIVISOR;
      } else {
        h
          = ((r - g) / d + HighContrastConstants.HSL_BLUE_HUE_OFFSET)
            / HighContrastConstants.HSL_HUE_DIVISOR;
      }

      return { h, s, l };
    };

    const hslToRgb = (hsl: {
      h: number;
      s: number;
      l: number;
    }): { r: number; g: number; b: number } => {
      const { h, s, l } = hsl;

      if (s === 0) {
        const gray = Math.round(l * HighContrastConstants.RGB_MAX_VALUE);
        return { r: gray, g: gray, b: gray };
      }

      const hue2rgb = (p: number, q: number, t: number): number => {
        let tNorm = t;
        if (tNorm < 0)
          tNorm += 1;
        if (tNorm > 1)
          tNorm -= 1;
        if (tNorm < HighContrastConstants.HSL_THRESHOLD_ONE_SIXTH)
          return p + (q - p) * HighContrastConstants.HSL_HUE_DIVISOR * tNorm;
        if (tNorm < HighContrastConstants.HSL_THRESHOLD_ONE_HALF)
          return q;
        if (tNorm < HighContrastConstants.HSL_THRESHOLD_TWO_THIRDS) {
          return (
            p
            + (q - p)
            * (HighContrastConstants.HSL_THRESHOLD_TWO_THIRDS - tNorm)
            * HighContrastConstants.HSL_HUE_DIVISOR
          );
        }
        return p;
      };

      const q
        = l < HighContrastConstants.LIGHTNESS_MIDPOINT
          ? l * (1 + s)
          : l + s - l * s;
      const p = 2 * l - q;

      return {
        r: Math.round(
          hue2rgb(p, q, h + HighContrastConstants.HSL_THRESHOLD_ONE_THIRD)
          * HighContrastConstants.RGB_MAX_VALUE,
        ),
        g: Math.round(hue2rgb(p, q, h) * HighContrastConstants.RGB_MAX_VALUE),
        b: Math.round(
          hue2rgb(p, q, h - HighContrastConstants.HSL_THRESHOLD_ONE_THIRD)
          * HighContrastConstants.RGB_MAX_VALUE,
        ),
      };
    };

    const selectorItems: {
      index: number;
      luminance: number;
      hsl: { h: number; s: number; l: number };
    }[] = [];

    for (let i = 0; i < colorInfos.length; i++) {
      const item = colorInfos[i];
      if (item.resolvedColor === null) {
        continue;
      }
      if (item.isInSelectors) {
        const parts = this.splitAlpha(item.resolvedColor);
        const rgb = parts === null ? null : this.parseColorToRgb(parts.hex);
        if (rgb) {
          const hsl = rgbToHsl(rgb);
          selectorItems.push({
            index: i,
            luminance: hsl.l,
            hsl,
          });
        }
      }
    }

    if (selectorItems.length <= 1) {
      return colorInfos.map(item => ({ ...item }));
    }

    const luminances = selectorItems.map(item => item.luminance);
    const minLum = Math.min(...luminances);
    const maxLum = Math.max(...luminances);
    const lumRange = maxLum - minLum;

    const result: ElementColorInfo[] = colorInfos.map(item => ({ ...item }));

    for (const selectorItem of selectorItems) {
      let newLuminance: number;

      if (lumRange === 0) {
        newLuminance = HighContrastConstants.DEFAULT_MIDRANGE_LUMINANCE;
      } else {
        const normalizedPosition = (selectorItem.luminance - minLum) / lumRange;
        newLuminance = normalizedPosition;
      }

      const newHsl = {
        h: selectorItem.hsl.h,
        s: selectorItem.hsl.s,
        l: newLuminance,
      };
      const newRgb = hslToRgb(newHsl);
      const newColor = this.rgbToHex(newRgb);

      result[selectorItem.index].spreadColor = newColor;
    }

    return result;
  }

  private applyPatternsToElements(
    highContrastElInfo: ElementColorInfo[],
  ): void {
    if (!this.originalColorInfo)
      return;

    const svg = this.getPlotSvg();
    if (!svg)
      return;

    if (!this.patternService) {
      this.patternService = new PatternService();
      this.patternService.initialize(svg);
    }

    const elementToHighContrastColor = new Map<SVGElement, string>();
    for (const item of highContrastElInfo) {
      if (item.isInSelectors && item.attr === 'fill' && item.resolvedColor !== null) {
        elementToHighContrastColor.set(item.element, item.color);
      }
    }

    const colorGroups = new Map<string, ElementColorInfo[]>();

    for (const item of this.originalColorInfo) {
      if (item.isInSelectors && item.attr === 'fill' && item.resolvedColor !== null) {
        const normalizedColor = this.normalizeColor(item.resolvedColor ?? item.color);
        if (!colorGroups.has(normalizedColor)) {
          colorGroups.set(normalizedColor, []);
        }
        colorGroups.get(normalizedColor)!.push(item);
      }
    }

    let patternIndex = 0;
    for (const [_color, elements] of colorGroups) {
      const patternType
        = this.patternService.getPatternTypeByIndex(patternIndex);

      for (const item of elements) {
        const baseColor
          = elementToHighContrastColor.get(item.element)
            || this.highContrastLightColor;

        const patternColor = this.getMostContrastingColor(baseColor);

        this.patternService.applyPattern(item.element, {
          type: patternType,
          baseColor,
          patternColor,
        });
      }

      patternIndex++;
    }
  }

  private getMostContrastingColor(color: string): string {
    const colorLuminance = this.getRelativeLuminance(color);
    const darkLuminance = this.getRelativeLuminance(this.highContrastDarkColor);
    const lightLuminance = this.getRelativeLuminance(
      this.highContrastLightColor,
    );

    const darkContrast = Math.abs(colorLuminance - darkLuminance);
    const lightContrast = Math.abs(colorLuminance - lightLuminance);

    return darkContrast > lightContrast
      ? this.highContrastDarkColor
      : this.highContrastLightColor;
  }

  private getRelativeLuminance(color: string): number {
    const rgb = this.parseColorToRgb(color);
    if (!rgb)
      return HighContrastConstants.DEFAULT_MIDRANGE_LUMINANCE;

    return (
      (HighContrastConstants.LUMINANCE_RED_COEFF * rgb.r
        + HighContrastConstants.LUMINANCE_GREEN_COEFF * rgb.g
        + HighContrastConstants.LUMINANCE_BLUE_COEFF * rgb.b)
      / HighContrastConstants.RGB_MAX_VALUE
    );
  }
}
