import type { Context } from '@model/context';
import type { Figure } from '@model/plot';
import type { DisplayService } from '@service/display';
import type { NotificationService } from '@service/notification';
import type { SettingsService } from '@service/settings';
import type { Rgb } from '@type/color';
import type { Disposable } from '@type/disposable';
import type { Event } from '@type/event';
import { PatternService } from '@service/pattern';
import { Emitter } from '@type/event';
import { Color } from '@util/color';
import { Constant } from '@util/constant';
import { t } from '@util/i18n';
import { Svg } from '@util/svg';

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
  // Under a label, a paint this faint is a hit area rather than a surface,
  // and one this solid hides whatever is drawn beneath it.
  MIN_SURFACE_ALPHA: 0.05,
  OPAQUE_SURFACE_ALPHA: 0.99,
  // Where a label's surface is read, across the line through its middle:
  // its centre first, then near each end.
  LABEL_SAMPLE_FRACTIONS: [0.5, 0.05, 0.95],
  // The halo given a label drawn across the edge of a shape: an SVG text's
  // stroke, and the reach of an HTML label's shadow.
  LABEL_HALO_WIDTH: '3px',
  LABEL_HALO_BLUR: '2px',
  // A light grey that is not part of the data -- a gridline, an axis, a frame
  // -- is drawn faint on purpose, and is kept faint: the light colour at
  // reduced opacity, so it stays visible without competing with the data.
  LIGHT_GREY_LUMINANCE_SCALE: 0.25,
  GREY_MAX_CHANNEL_SPREAD: 24,
  // Paper is white, or a tint of it: Mermaid's #ececff, #ffffde. A pale
  // yellow as light, such as Mermaid's #ffff78 series and sections, is ink.
  PAPER_MAX_CHANNEL_SPREAD: 64,
  // An outline this much darker than its fill, on the 0-1 luminance scale,
  // shows as the edge of a box drawn in tints of the paper: Mermaid's #eeeebc
  // round #ffffde is 0.07 darker.
  PAPER_OUTLINE_MIN_STEP: 0.03,
  FAINT_INK_ALPHA: 0.5,
  // The contrast a gradient's colours are lifted to against the backdrop:
  // the 3:1 a graphical object needs (WCAG 1.4.11), with room for the
  // colours a gradient mixes between two stops, which can show darker than
  // either. And how closely the lifted colour is sought.
  GRADIENT_STOP_CONTRAST: 3.5,
  GRADIENT_LIFT_STEPS: 12,
  // How far a line's casing reaches past its stroke on each side, in the
  // line's own units.
  LINE_CASING_RADIUS: 2,
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
 * Blend modes that keep a mark's own colour over a light backdrop, each with
 * its counterpart over a dark one: multiplied over white, or screened over
 * black, a colour stays as it is; multiplied over black, or screened over
 * white, it is lost in the backdrop.
 */
const BLEND_MODE_COUNTERPARTS: readonly (readonly [light: string, dark: string])[] = [
  ['multiply', 'screen'],
  ['darken', 'lighten'],
  ['color-burn', 'color-dodge'],
];

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

/**
 * Trace types whose marks are bars: a bar's own near-white fill is still a
 * bar, where any other near-white paint is the paper showing through.
 */
const BAR_LIKE_TRACE_TYPES: ReadonlySet<string> = new Set(['bar', 'hist']);

/** Trace types drawn as a line through their points. */
const LINE_TRACE_TYPES: ReadonlySet<string> = new Set(['line', 'step']);

/** Elements that draw text rather than a shape. */
const TEXT_TAGS: ReadonlySet<string> = new Set(['text', 'tspan', 'textPath']);

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** The shapes a label can be drawn on. */
const SURFACE_TAGS: ReadonlySet<string> = new Set([
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'path',
  'polyline',
]);

/** The shapes a legend draws its keys with. */
const SWATCH_TAGS: ReadonlySet<string> = new Set(['rect', 'path', 'circle', 'ellipse', 'polygon']);

/** Containers whose content is defined for use elsewhere, not drawn there. */
const DEFINITION_CONTAINERS = 'defs, clipPath, mask, marker, pattern, symbol';

/**
 * Whether an element is one of MAIDR's own copies, or inside one: the hidden
 * copies highlights are cloned from, and the highlights themselves, which
 * come and go with the reader.
 */
function isInMaidrCopy(element: Element): boolean {
  for (let node: Element | null = element; node !== null; node = node.parentElement) {
    if (Svg.isOwned(node)) {
      return true;
    }
  }
  return false;
}

/** A paint laid over what is beneath it: its colour, and how much it covers. */
interface SurfaceLayer {
  rgb: Rgb;
  alpha: number;
}

/**
 * A label, the end of the reader's pair it reads in, the paint it takes, and
 * the other end as a halo when no one colour reads on all of it.
 */
interface LabelChoice {
  label: HTMLElement | SVGElement;
  property: 'fill' | 'color';
  color: string;
  halo: string | null;
}

/** The element maidr builds around a chart and everything it shows for it. */
const CHART_ROOT_SELECTOR = `article[id^="${Constant.MAIDR_ARTICLE}-"]`;

/** Elements that never draw anything themselves. */
const UNDRAWN_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'link',
  'meta',
  'base',
  'title',
  'template',
  'noscript',
  'datalist',
]);

/** Elements that show something with no text in them. */
const DRAWING_SELECTOR = [
  'img',
  'svg',
  'canvas',
  'video',
  'audio[controls]',
  'iframe',
  'object',
  'embed',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'button',
  'hr',
  'progress',
  'meter',
].join(', ');

const HIDDEN_VISIBILITY: ReadonlySet<string> = new Set(['hidden', 'collapse']);

/** The paints an SVG element is given. */
type PaintProperty = 'fill' | 'stroke';
const PAINT_PROPERTIES: readonly PaintProperty[] = ['fill', 'stroke'];

/**
 * The elements under `roots` a stylesheet rule paints, and which of their
 * paints. A rule outranks a presentation attribute, so such a paint is what
 * the element shows whatever its `fill` or `stroke` attribute says: Mermaid
 * paints edges, markers, node fills and axis text this way, from the
 * `<style>` it puts in the diagram. Rules nested in at-rules and imported
 * sheets count; a sheet another origin serves cannot be read, and a selector
 * `querySelectorAll` rejects -- a pseudo-element -- paints no element.
 */
function stylesheetPaints(roots: Element[]): Map<Element, Set<PaintProperty>> {
  const painted = new Map<Element, Set<PaintProperty>>();
  const sheets: CSSStyleSheet[] = [];
  for (const scope of new Set(roots.map(root => root.getRootNode()))) {
    if ('styleSheets' in scope) {
      const { styleSheets, adoptedStyleSheets } = scope as Document | ShadowRoot;
      sheets.push(...Array.from(styleSheets), ...(adoptedStyleSheets ?? []));
    }
  }
  // Rules are told apart by what they hold rather than by class, which
  // differs in a chart drawn in another frame.
  const visit = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      const { selectorText, style } = rule as Partial<CSSStyleRule>;
      if (typeof selectorText === 'string' && style !== undefined) {
        const properties = PAINT_PROPERTIES.filter(property => style.getPropertyValue(property) !== '');
        for (const root of properties.length === 0 ? [] : roots) {
          let matches: Element[] = [];
          try {
            matches = Array.from(root.querySelectorAll(selectorText));
          } catch {
            // A selector no element can match, such as a pseudo-element.
          }
          for (const element of matches) {
            const paints = painted.get(element) ?? new Set<PaintProperty>();
            properties.forEach(property => paints.add(property));
            painted.set(element, paints);
          }
        }
      }
      const { styleSheet } = rule as Partial<CSSImportRule>;
      const { cssRules } = rule as Partial<CSSGroupingRule>;
      if (styleSheet) {
        sheets.push(styleSheet);
      } else if (cssRules) {
        // At-rules that group rules, and rules nested in a style rule.
        visit(cssRules);
      }
    }
  };
  // Grows as imported sheets are found.
  for (let at = 0; at < sheets.length; at++) {
    let rules: CSSRuleList;
    try {
      rules = sheets[at].cssRules;
    } catch {
      // Served from another origin: its rules cannot be read.
      continue;
    }
    visit(rules);
  }
  return painted;
}

/**
 * Whether an element is positioned wholly where no scroll can reach: above
 * the document's top, or before its start in a left-to-right page. Plotly
 * keeps its text-measuring `svg#js-plotly-tester` at -10000px on every page,
 * and visually hidden text is often parked the same way. Neither shows a
 * reader anything.
 */
function isOffCanvas(element: Element, style: CSSStyleDeclaration): boolean {
  if (style.position !== 'absolute' && style.position !== 'fixed') {
    return false;
  }
  const view = element.ownerDocument.defaultView;
  const rect = element.getBoundingClientRect();
  // A fixed element keeps its place in the viewport whatever the scroll.
  const scrolls = style.position === 'absolute' && view !== null;
  const scrollX = scrolls ? view.scrollX : 0;
  const scrollY = scrolls ? view.scrollY : 0;
  const leftToRight = view === null
    || view.getComputedStyle(element.ownerDocument.documentElement).direction !== 'rtl';
  return rect.bottom + scrollY < 0 || (leftToRight && rect.right + scrollX < 0);
}

/**
 * Whether a node shows a reader anything: text, or something drawn.
 *
 * Errs towards yes. Text hidden only visually, or at zero opacity, counts; so
 * does a custom element, which may draw from a closed shadow root -- one that
 * reads as no root at all. On any other element an open shadow root is read
 * along with the element's own children, and a closed one cannot be seen
 * from here.
 */
function showsSomething(node: Node): boolean {
  const view = node.ownerDocument?.defaultView ?? null;
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement;
    return (node.textContent ?? '').trim() !== ''
      && (parent === null || view === null
        || !HIDDEN_VISIBILITY.has(view.getComputedStyle(parent).visibility));
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const element = node as Element;
  if (UNDRAWN_TAGS.has(element.localName) || element.hasAttribute('hidden')) {
    return false;
  }
  const style = view?.getComputedStyle(element) ?? null;
  if (style?.display === 'none') {
    return false;
  }
  if (style !== null && isOffCanvas(element, style)) {
    return false;
  }
  // May be drawn from a tree this cannot see into: taken to show something.
  if (element.localName.includes('-')) {
    return true;
  }
  if (element.matches(DRAWING_SELECTOR)) {
    return style === null || !HIDDEN_VISIBILITY.has(style.visibility);
  }
  // An open shadow root is read with the children it may slot in. BokehJS 3
  // adds hosts to the body of a page it draws on whose roots hold only style
  // sheets and empty layers.
  const shadowChildren = element.shadowRoot === null
    ? []
    : Array.from(element.shadowRoot.childNodes);
  return [...shadowChildren, ...Array.from(element.childNodes)].some(showsSomething);
}

/**
 * Whether nothing outside `extent` shows in its document -- as in a frame
 * built for one chart, or a page `save_html` wrote -- so that painting the
 * body paints the chart's surroundings and nothing else.
 *
 * Only the chart's own document is read, never a parent frame's, so the
 * answer is the same across origins. Whether the document is framed is not
 * asked: a frame can hold a whole page (a Shiny app in an IDE viewer, an
 * Office task pane), and a page opened in its own tab can hold one chart.
 * In doubt the page counts as shared: painting the chart alone leaves a light
 * margin in a frame, while painting the body of a page the chart shares
 * repaints someone else's page.
 */
function hasDocumentToItself(extent: Element): boolean {
  const body = extent.ownerDocument.body;
  if (body === null || extent === body || !body.contains(extent)) {
    return false;
  }
  let node: Element = extent;
  while (node !== body) {
    const parent = node.parentElement;
    if (parent === null) {
      return false;
    }
    for (const sibling of Array.from(parent.childNodes)) {
      if (sibling !== node && showsSomething(sibling)) {
        return false;
      }
    }
    node = parent;
  }
  return true;
}

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
  /** The type of the layer whose selectors pick this element, when one does. */
  traceType?: string;
  cantBeBackground: boolean;
  attr: 'fill' | 'stroke';
  /**
   * Where the paint is written: the style attribute, a presentation
   * attribute, or a stylesheet rule -- whose computed value is captured, and
   * overridden with an inline declaration.
   */
  attrType?: 'style' | 'attribute' | 'computed';
}

/** An inline declaration this service overrode, and what it held before. */
interface InlineStyleSnapshot {
  element: HTMLElement | SVGElement;
  property: string;
  value: string;
  priority: string;
  /** Whether the element had a style attribute at all. */
  hadStyle: boolean;
}

/**
 * HighContrastService manages the high contrast accessibility mode.
 *
 * Key behaviors:
 * - Captures original colors in constructor (before any transformations)
 * - Applies high contrast on focus-in via initializeHighContrast()
 * - Restores original colors on blur via suspendHighContrast()
 * - Responds to settings changes (toggle via keyboard/UI)
 * - Paints the backdrop behind the chart: the body of a document the chart
 *   has to itself, its own article in a page it shares (see getBackdrop)
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

  private readonly onDidRepaintEmitter = new Emitter<void>();

  // Cached original colors - captured once on first application
  private originalColorInfo: ElementColorInfo[] | null = null;

  // Inline declarations overridden while high contrast is painted: the
  // backdrop (see getBackdrop), the plot's own CSS background and the fill of
  // text the captured colours do not reach. Each is put back exactly as it
  // was on restore -- the inline value with its priority, or none, so the
  // page's stylesheet, and a host's theme toggle, keep their say.
  private inlineStyleSnapshots: InlineStyleSnapshot[] = [];

  // Taken with the original colours, so an apply never reads its own output:
  // the chart surfaces that paint a CSS background, and for each text element
  // without an inline fill, whether it was drawn near-white.
  private backgroundSurfaces: (HTMLElement | SVGElement)[] = [];
  private uncapturedTextIsPaper = new Map<SVGElement, boolean>();
  // HTML drawn inside the SVG, as Mermaid draws its labels: the boxes that
  // paint a CSS background, and for each element holding text, whether its
  // CSS colour was near-white.
  private htmlSurfaces: HTMLElement[] = [];
  private htmlTextIsPaper = new Map<HTMLElement, boolean>();

  // The paints a stylesheet rule gives each element of the chart, read on
  // every capture.
  private sheetPaints = new Map<Element, Set<PaintProperty>>();

  // Cache of all trace elements for high contrast mode, each with the type
  // of the layer that selects it
  private traceElementsCache: Map<SVGElement, string> | null = null;

  // Pattern service for high contrast mode patterns
  private patternService: PatternService | null = null;

  // The lines cased in the background colour while high contrast is painted,
  // each with the filter that draws its casing.
  private lineCasings: { line: SVGElement; filter: SVGFilterElement }[] = [];

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
      } else if (
        this.highContrastApplied
        && (event.affectsSetting(HighContrastSettings.LEVELS)
          || event.affectsSetting(HighContrastSettings.LIGHT_COLOR)
          || event.affectsSetting(HighContrastSettings.DARK_COLOR))
      ) {
        // New colours or levels saved while painted: repaint from the captured
        // originals, as a live update does, so the change shows straight away.
        this.restoreOriginalColors();
        this.applyHighContrast();
        this.onDidRepaintEmitter.fire();
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
    // Capture SVG element colors
    this.sheetPaints = stylesheetPaints(this.getColorRoots());
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
   * - HTML inside a `<foreignObject>` takes its colour from CSS `color`, which
   *   neither a fill nor the backdrop's colour reaches past a rule of its own,
   *   and may sit on a box of its own: Mermaid's labels.
   */
  private captureSurfacesAndText(): void {
    this.backgroundSurfaces = [];
    this.uncapturedTextIsPaper = new Map();
    this.htmlSurfaces = [];
    this.htmlTextIsPaper = new Map();

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
        && !this.sheetPaints.get(text)?.has('fill')
      ) {
        // A span that takes its colour from its <text> follows it there. One
        // a rule colours keeps that colour, however it compares.
        continue;
      }
      const fill = this.resolvePaint(text, 'fill', computedFill);
      const parts = fill === null ? null : this.splitAlpha(fill);
      this.uncapturedTextIsPaper.set(
        text,
        parts !== null
        && !this.isTiledChart()
        && this.isPaperColor(parts.hex),
      );
    }

    // Told by namespace, which holds for a chart drawn in another frame.
    const html = roots.flatMap(root => Array.from(root.querySelectorAll<HTMLElement>('foreignObject *')))
      .filter(element => element.namespaceURI === HTML_NAMESPACE);
    for (const element of html) {
      const style = window.getComputedStyle(element);
      const background = this.parseCssColor(style.backgroundColor);
      const backgroundParts = background === null ? null : this.splitAlpha(background);
      if (backgroundParts !== null && backgroundParts.alpha > 0) {
        this.htmlSurfaces.push(element);
      }
      // Only an element holding text draws glyphs in its colour.
      const holdsText = Array.from(element.childNodes).some(node =>
        node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');
      if (!holdsText) {
        continue;
      }
      const color = this.parseCssColor(style.color);
      const parts = color === null ? null : this.splitAlpha(color);
      // The rule SVG text follows: light, unless drawn near-white.
      this.htmlTextIsPaper.set(
        element,
        parts !== null && !this.isTiledChart() && this.isPaperColor(parts.hex),
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

  /**
   * Fires once the reader has turned high contrast on or off, or changed its
   * colours or levels, and the chart has been repainted to match. A copy
   * taken of the chart's paint before -- the highlight -- is stale from then.
   */
  public get onDidRepaint(): Event<void> {
    return this.onDidRepaintEmitter.event;
  }

  public dispose(): void {
    // Unsubscribe from settings changes
    if (this.settingsDisposable) {
      this.settingsDisposable.dispose();
      this.settingsDisposable = null;
    }
    this.onDidRepaintEmitter.dispose();

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
      this.onDidRepaintEmitter.fire();
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
    this.liftGradients();
    // A paint a stylesheet rule gives is overridden inline, `!important`, the
    // one declaration an `!important` rule -- a Mermaid classDef -- cannot
    // beat. After the overrides above, which start by putting every inline
    // declaration back.
    for (const item of highContrastElInfo) {
      if (item.attrType === 'computed') {
        this.overrideInlineStyle(item.element, item.attr, item.color, 'important');
      }
    }

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

    this.caseLinesOverBars();

    // Handle line chart exception. Step charts render as the same kind of
    // stroked polyline, so they need the same treatment.
    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'line'
        || this.context.instructionContext.type === 'step'
      ) {
        this.getChartIdElement()?.classList.add('high-contrast');
      }
    }

    // Apply plot fill style. Set only the `fill` property so any other inline
    // styles on the plot element (e.g. React's `width: fit-content`) are preserved.
    this.displayService.plot.style.setProperty('fill', this.highContrastLightColor);

    // Handle stacked/dodged/normalized bar, mosaic, pie and radar exceptions:
    // apply patterns.
    //
    // These are the chart types whose marks touch or overlap each other, so
    // the boundary between two of them is carried by their fill alone. High
    // contrast then pushes neighbouring fills toward the same end of the ramp
    // and the marks merge into one shape — adjacent pie wedges of a similar
    // hue are the worst case, since a pie is nothing but touching marks, and a
    // radar's series are filled areas drawn one over another. A distinct
    // pattern per original fill keeps them separable without relying on
    // colour.
    if ('type' in this.context.instructionContext) {
      if (
        this.context.instructionContext.type === 'stacked_bar'
        || this.context.instructionContext.type === 'dodged_bar'
        || this.context.instructionContext.type === 'pie'
        || this.context.instructionContext.type === 'stacked_normalized_bar'
        || this.context.instructionContext.type === 'mosaic'
        || this.context.instructionContext.type === 'radar'
      ) {
        this.applyPatternsToElements(highContrastElInfo, textDescendants);
      }
    }

    this.pairLabelsWithSurfaces(textDescendants);

    this.highContrastApplied = true;
  }

  /**
   * Restore original colors when turning off high contrast.
   */
  private restoreOriginalColors(): void {
    if (!this.originalColorInfo) {
      return;
    }

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
        this.getChartIdElement()?.classList.remove('high-contrast');
      }
    }

    // Restore plot fill style by removing only the `fill` property we set,
    // leaving all other inline styles on the plot element intact.
    this.displayService.plot.style.removeProperty('fill');

    // The glow filter was added for the text; nothing refers to it any more.
    this.getPlotSvg()?.querySelector('#glow-shadow')?.remove();

    for (const { line, filter } of this.lineCasings) {
      if (line.getAttribute('filter') === `url(#${filter.id})`) {
        line.removeAttribute('filter');
      }
      filter.remove();
    }
    this.lineCasings = [];

    // Clean up pattern service
    if (this.patternService) {
      this.patternService.dispose();
      this.patternService = null;
    }

    this.highContrastApplied = false;
  }

  // ========== Helper Methods ==========

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
   * reach, recording each so restore can put it back: the backdrop behind the
   * chart, the chart's CSS background, and the fill of text coloured by a
   * stylesheet rule -- which outranks both a fill attribute and the colour
   * set on the plot, where an inline declaration outranks it.
   */
  private overrideInlineStyles(): void {
    this.restoreInlineStyles();

    // Asked again on every apply: the page may have gained or lost content
    // since the last one. Restore needs no answer, since each snapshot names
    // the element it was taken from.
    const backdrop = this.getBackdrop();
    this.overrideInlineStyle(backdrop, 'background-color', this.highContrastDarkColor);
    this.overrideInlineStyle(backdrop, 'color', this.highContrastLightColor);
    // The reader's pair again, for MAIDR's braille and review fields, whose
    // colours a page's stylesheet can split: a reset may make them inherit the
    // light colour above and leave the browser's white field under it. The
    // rule that reads these (FIELD_HIGH_CONTRAST_RULE, maidr-component.tsx)
    // gives the fields both at once, and goes when restore removes them; the
    // fields' floor (readableField.ts) reads them too, to set the pair on a
    // field whose page colours it with `!important`.
    this.overrideInlineStyle(backdrop, Constant.HIGH_CONTRAST_LIGHT_PROPERTY, this.highContrastLightColor);
    this.overrideInlineStyle(backdrop, Constant.HIGH_CONTRAST_DARK_PROPERTY, this.highContrastDarkColor);

    for (const surface of this.backgroundSurfaces) {
      this.overrideInlineStyle(surface, 'background-color', this.highContrastDarkColor);
    }

    // `!important`, which a Mermaid classDef -- an `!important` rule, or an
    // `!important` declaration Mermaid writes inline -- cannot beat.
    for (const surface of this.htmlSurfaces) {
      this.overrideInlineStyle(surface, 'background-color', this.highContrastDarkColor, 'important');
    }
    for (const [label, isPaper] of this.htmlTextIsPaper) {
      this.overrideInlineStyle(
        label,
        'color',
        isPaper ? this.highContrastDarkColor : this.highContrastLightColor,
        'important',
      );
    }

    for (const [text, isPaper] of this.uncapturedTextIsPaper) {
      this.overrideInlineStyle(
        text,
        'fill',
        isPaper ? this.highContrastDarkColor : this.highContrastLightColor,
        'important',
      );
    }

    // A blended mark takes its colour from what lies beneath it, which is now
    // the reader's backdrop: Mermaid draws a sankey's links `multiply`, and
    // anything multiplied over black is black, whatever colour it is given.
    // A mode with a counterpart takes the one that suits the backdrop: over a
    // dark one, a link screened keeps its colour, and the light labels it is
    // drawn over show through it, the highlight's included, as dark labels
    // show through a link multiplied on a white page. Any other mode is drawn
    // normally. Every element is read before any is written, so the scan
    // costs one style pass. Asked on every apply, so it also reaches the
    // hidden copies highlights are cloned from, and a highlight already drawn.
    const darkBackdrop = this.getRelativeLuminance(this.highContrastDarkColor)
      <= this.getRelativeLuminance(this.highContrastLightColor);
    const blended = this.getColorRoots()
      .flatMap(root => [root, ...Array.from(root.querySelectorAll('*'))])
      .map(element => ({ element, mode: window.getComputedStyle(element).getPropertyValue('mix-blend-mode') }))
      .filter((blend): blend is { element: HTMLElement | SVGElement; mode: string } =>
        'style' in blend.element && blend.mode !== '' && blend.mode !== 'normal');
    for (const { element, mode } of blended) {
      const counterparts = BLEND_MODE_COUNTERPARTS.find(modes => modes.includes(mode));
      const wanted = counterparts === undefined ? 'normal' : counterparts[darkBackdrop ? 1 : 0];
      if (wanted !== mode) {
        this.overrideInlineStyle(element, 'mix-blend-mode', wanted);
      }
    }
  }

  /**
   * Lifts the colours of each gradient the chart paints with until, at the
   * opacity it is drawn at, each reads at better than 3:1 against the dark
   * backdrop.
   *
   * A gradient names no one colour to map onto the ramp, so it is drawn as
   * the chart drew it: Mermaid strokes a sankey's links with a gradient from
   * the source's colour to the target's at half opacity, which on the dark
   * backdrop came out under 2.7:1. Each colour keeps its hue, lightened
   * towards the light colour only as far as it needs, so touching links stay
   * apart by colour; one that already reads, or is drawn as faintly as a hit
   * area, is left alone. A gradient several paints use is lifted for the
   * faintest of them. On a tiled chart a gradient is its colour scale, read
   * against the cells, and is left as drawn.
   */
  private liftGradients(): void {
    const light = this.parseColorToRgb(this.highContrastLightColor);
    const dark = this.parseColorToRgb(this.highContrastDarkColor);
    if (light === null || dark === null || this.isTiledChart()) {
      return;
    }

    // Read every paint before writing any colour, so the scan costs one
    // style pass.
    const opacities = new Map<Element, number>();
    const opacityOf = (element: Element): number => {
      const cached = opacities.get(element);
      if (cached !== undefined) {
        return cached;
      }
      const own = Number.parseFloat(window.getComputedStyle(element).opacity);
      const parent = element.parentElement;
      const opacity = (Number.isNaN(own) ? 1 : own) * (parent === null ? 1 : opacityOf(parent));
      opacities.set(element, opacity);
      return opacity;
    };
    const faintest = new Map<SVGStopElement, number>();
    for (const element of this.getColorRoots().flatMap(root => Array.from(root.querySelectorAll('*')))) {
      const style = window.getComputedStyle(element);
      for (const attr of PAINT_PROPERTIES) {
        // A computed paint is empty only where styles are not resolved at all.
        const paint = style.getPropertyValue(attr).trim() || (element.getAttribute(attr) ?? '');
        const id = paint.match(/^url\(\s*["']?#([^"')\s]+)["']?\s*\)$/)?.[1];
        const stops = id === undefined ? [] : this.gradientStops(element.ownerDocument.getElementById(id));
        if (stops.length === 0) {
          continue;
        }
        const own = Number.parseFloat(style.getPropertyValue(`${attr}-opacity`));
        const alpha = (Number.isNaN(own) ? 1 : own) * opacityOf(element);
        for (const stop of stops) {
          faintest.set(stop, Math.min(faintest.get(stop) ?? 1, alpha));
        }
      }
    }

    const lifts: { stop: SVGStopElement; color: string }[] = [];
    for (const [stop, paintAlpha] of faintest) {
      const style = window.getComputedStyle(stop);
      const value = style.getPropertyValue('stop-color').trim() || (stop.getAttribute('stop-color') ?? '');
      const parsed = this.parseCssColor(value);
      const parts = parsed === null ? null : this.splitAlpha(parsed);
      const rgb = parts === null ? null : this.parseColorToRgb(parts.hex);
      const stopOpacity = Number.parseFloat(style.getPropertyValue('stop-opacity') || (stop.getAttribute('stop-opacity') ?? ''));
      if (parts === null || rgb === null) {
        continue;
      }
      const alpha = paintAlpha * parts.alpha * (Number.isNaN(stopOpacity) ? 1 : stopOpacity);
      const toward = (t: number): Rgb => ({
        r: rgb.r + t * (light.r - rgb.r),
        g: rgb.g + t * (light.g - rgb.g),
        b: rgb.b + t * (light.b - rgb.b),
      });
      const reads = (t: number): boolean => {
        const color = toward(t);
        const shown = {
          r: color.r * alpha + dark.r * (1 - alpha),
          g: color.g * alpha + dark.g * (1 - alpha),
          b: color.b * alpha + dark.b * (1 - alpha),
        };
        return Color.getContrastRatio(shown, dark) >= HighContrastConstants.GRADIENT_STOP_CONTRAST;
      };
      if (alpha < HighContrastConstants.MIN_SURFACE_ALPHA || reads(0)) {
        continue;
      }
      // The least lift that reads, or the light colour itself.
      let [low, high] = [0, 1];
      for (let step = 0; step < HighContrastConstants.GRADIENT_LIFT_STEPS; step++) {
        const middle = (low + high) / 2;
        [low, high] = reads(middle) ? [low, middle] : [middle, high];
      }
      const lifted = toward(high);
      const hex = this.rgbToHex({ r: Math.round(lifted.r), g: Math.round(lifted.g), b: Math.round(lifted.b) });
      lifts.push({ stop, color: this.applyAlpha(hex, parts.alpha) });
    }
    for (const { stop, color } of lifts) {
      this.overrideInlineStyle(stop, 'stop-color', color, 'important');
    }
  }

  /**
   * The stops of a linear or radial gradient, or of the one it takes them
   * from through `href` when it has none of its own; none for anything else.
   */
  private gradientStops(element: Element | null): SVGStopElement[] {
    let gradient = element;
    for (let hops = 0; gradient !== null && hops < 8; hops++) {
      if (gradient.namespaceURI !== SVG_NAMESPACE
        || (gradient.localName !== 'linearGradient' && gradient.localName !== 'radialGradient')) {
        return [];
      }
      const stops = Array.from(gradient.children)
        .filter((child): child is SVGStopElement => child.namespaceURI === SVG_NAMESPACE && child.localName === 'stop');
      if (stops.length > 0) {
        return stops;
      }
      const href = gradient.getAttribute('href') ?? gradient.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      gradient = href?.startsWith('#') ? gradient.ownerDocument.getElementById(href.slice(1)) : null;
    }
    return [];
  }

  /**
   * Overrides one inline declaration, recording what it held. The same
   * declaration can be overridden twice in one apply -- the backdrop is the
   * plot itself when the plot has no article around it, and the plot can be
   * a background surface too -- so the second snapshot holds the first
   * override, and restore must replay them last first.
   */
  private overrideInlineStyle(
    element: HTMLElement | SVGElement,
    property: string,
    value: string,
    priority: '' | 'important' = '',
  ): void {
    this.inlineStyleSnapshots.push({
      element,
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
      hadStyle: element.hasAttribute('style'),
    });
    element.style.setProperty(property, value, priority);
  }

  /**
   * Gives each label the end of the reader's pair that reads on the surface
   * actually under it, once every paint is final.
   *
   * Labels and shapes are mapped one paint at a time, so nothing else keeps
   * them apart: a dark label is sent light, and so is a pastel box lifted
   * off the background, or a box a stylesheet paints and nothing captures --
   * white on white. Each label with a shape under it now takes whichever of
   * the two colours stands out more from that shape, as it is painted now;
   * a label on nothing keeps the colour it was given. A label drawn across
   * the edge of a shape, part on it and part off, can take no one colour that
   * reads on both: it takes the one that reads on more of it, with a halo of
   * the other round its glyphs. Text that draws its own
   * halo is already kept apart from what lies beneath, and the labels of a
   * tiled chart keep their glow instead. The labels of MAIDR's hidden copies
   * are paired too, with the original drawn beneath them, since the reader's
   * highlight is cloned from a copy and shows its labels over the original.
   *
   * Every choice is read before any is written, so the pass costs a style
   * pass for the labels and one more for the spans inside them.
   */
  private pairLabelsWithSurfaces(textDescendants: Map<Element, boolean>): void {
    if (this.isTiledChart()) {
      return;
    }
    const light = this.parseColorToRgb(this.highContrastLightColor);
    const dark = this.parseColorToRgb(this.highContrastDarkColor);
    if (light === null || dark === null) {
      return;
    }

    // Document order, overlays after the plot: what is drawn later is drawn
    // on top.
    const painted = this.getColorRoots().flatMap(root => Array.from(root.querySelectorAll('*')));
    const order = new Map<Element, number>(painted.map((element, index) => [element, index]));

    const rects = new Map<Element, DOMRect>();
    const rectOf = (element: Element): DOMRect => {
      let rect = rects.get(element);
      if (rect === undefined) {
        rect = element.getBoundingClientRect();
        rects.set(element, rect);
      }
      return rect;
    };
    const styles = new Map<Element, CSSStyleDeclaration>();
    const styleOf = (element: Element): CSSStyleDeclaration => {
      let style = styles.get(element);
      if (style === undefined) {
        style = window.getComputedStyle(element);
        styles.set(element, style);
      }
      return style;
    };
    const opacities = new Map<Element, number>();
    const opacityOf = (element: Element): number => {
      const cached = opacities.get(element);
      if (cached !== undefined) {
        return cached;
      }
      const own = Number.parseFloat(styleOf(element).opacity);
      const parent = element.parentElement;
      const opacity = (Number.isNaN(own) ? 1 : own) * (parent === null ? 1 : opacityOf(parent));
      opacities.set(element, opacity);
      return opacity;
    };
    const isDrawn = (element: Element): boolean => {
      if (element.closest(DEFINITION_CONTAINERS) !== null || isInMaidrCopy(element)) {
        return false;
      }
      const style = styleOf(element);
      return style.display !== 'none' && !HIDDEN_VISIBILITY.has(style.visibility);
    };
    // A label in one of MAIDR's copies is hidden only until a highlight shows
    // it, over its original: the highlight is cloned from the copy, label and
    // all, and outlines the shapes it holds without filling them.
    const isLabelShown = (element: Element): boolean => {
      if (element.closest(DEFINITION_CONTAINERS) !== null) {
        return false;
      }
      const style = styleOf(element);
      return style.display !== 'none'
        && (isInMaidrCopy(element) || !HIDDEN_VISIBILITY.has(style.visibility));
    };

    // A paint under the point: a layer, nothing (`undefined`), or one that
    // cannot be read -- a gradient or pattern -- which ends the search.
    const layerAt = (element: Element, x: number, y: number): SurfaceLayer | undefined | null => {
      if (element.namespaceURI !== SVG_NAMESPACE || !SURFACE_TAGS.has(element.localName)) {
        return undefined;
      }
      const rect = rectOf(element);
      if (rect.width <= 0 || rect.height <= 0
        || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        return undefined;
      }
      if (!isDrawn(element) || this.isTextDescendant(element, textDescendants)
        || !this.fillsPoint(element, x, y)) {
        return undefined;
      }
      const style = styleOf(element);
      // A computed fill is empty only where styles are not resolved at all.
      const fill = style.getPropertyValue('fill').trim() || (element.getAttribute('fill') ?? '');
      if (fill === '' || fill === 'none') {
        return undefined;
      }
      const parsed = fill.startsWith('url(') ? null : this.parseCssColor(fill);
      const parts = parsed === null ? null : this.splitAlpha(parsed);
      const rgb = parts === null ? null : this.parseColorToRgb(parts.hex);
      if (parts === null || rgb === null) {
        return null;
      }
      const fillOpacity = Number.parseFloat(style.getPropertyValue('fill-opacity'));
      const alpha = parts.alpha * (Number.isNaN(fillOpacity) ? 1 : fillOpacity) * opacityOf(element);
      return alpha < HighContrastConstants.MIN_SURFACE_ALPHA ? undefined : { rgb, alpha };
    };

    // What a reader sees at a point under the element at `index`: the layers
    // drawn there down to the first opaque one, over the dark backdrop when
    // none is. `undefined` when nothing is drawn there, `null` when what is
    // cannot be read.
    const surfaceUnder = (index: number, x: number, y: number, above: SurfaceLayer[]): Rgb | null | undefined => {
      const layers = [...above];
      const isOpaque = (layer: SurfaceLayer): boolean =>
        layer.alpha >= HighContrastConstants.OPAQUE_SURFACE_ALPHA;
      for (let at = index - 1; at >= 0 && !layers.some(isOpaque); at--) {
        const layer = layerAt(painted[at], x, y);
        if (layer === null) {
          return null;
        }
        if (layer !== undefined) {
          layers.push(layer);
        }
      }
      if (layers.length === 0) {
        return undefined;
      }
      const opaqueAt = layers.findIndex(isOpaque);
      const stack = opaqueAt === -1 ? layers : layers.slice(0, opaqueAt + 1);
      let seen: Rgb = opaqueAt === -1 ? dark : stack[stack.length - 1].rgb;
      for (let at = (opaqueAt === -1 ? stack.length : opaqueAt) - 1; at >= 0; at--) {
        const { rgb, alpha } = stack[at];
        seen = {
          r: rgb.r * alpha + seen.r * (1 - alpha),
          g: rgb.g * alpha + seen.g * (1 - alpha),
          b: rgb.b * alpha + seen.b * (1 - alpha),
        };
      }
      return seen;
    };

    const choose = (surface: Rgb): string =>
      Color.getContrastRatio(surface, light) >= Color.getContrastRatio(surface, dark)
        ? this.highContrastLightColor
        : this.highContrastDarkColor;
    // The paint a label takes, read from its centre and its two ends, and a
    // halo when they disagree. `null` keeps the colour it was given: its
    // centre cannot be read, or nothing is drawn under any of it. Where
    // something is drawn under part of it, the rest is on the dark backdrop.
    const pick = (element: Element, index: number, above: SurfaceLayer[]): Omit<LabelChoice, 'label' | 'property'> | null => {
      const rect = rectOf(element);
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      const y = rect.top + rect.height / 2;
      const seen = HighContrastConstants.LABEL_SAMPLE_FRACTIONS
        .map(fraction => surfaceUnder(index, rect.left + rect.width * fraction, y, above));
      if (seen[0] === null || seen.every(surface => surface == null)) {
        return null;
      }
      const choices = seen
        .filter((surface): surface is Rgb | undefined => surface !== null)
        .map(surface => choose(surface ?? dark));
      const lightShare = choices.filter(choice => choice === this.highContrastLightColor).length / choices.length;
      const color = lightShare === 0.5
        ? choices[0]
        : lightShare > 0.5 ? this.highContrastLightColor : this.highContrastDarkColor;
      const other = color === this.highContrastLightColor ? this.highContrastDarkColor : this.highContrastLightColor;
      return { color, halo: choices.every(choice => choice === color) ? null : other };
    };
    const hasOwnText = (element: Element): boolean => Array.from(element.childNodes).some(node =>
      node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');

    const choices: LabelChoice[] = [];
    painted.forEach((element, index) => {
      if (element.namespaceURI !== SVG_NAMESPACE) {
        return;
      }
      if (element.localName === 'text') {
        // The glyphs are drawn by the elements holding the text, which may be
        // spans with a stroke of their own, or none where the label has one.
        const glyphs = [element, ...Array.from(element.querySelectorAll('tspan, textPath'))]
          .filter(hasOwnText);
        if (glyphs.length === 0 || !isLabelShown(element)
          || glyphs.every(glyph => this.hasHalo(styleOf(glyph)))) {
          return;
        }
        const choice = pick(element, index, []);
        if (choice !== null) {
          choices.push({ label: element as SVGElement, property: 'fill', ...choice });
        }
      } else if (element.localName === 'foreignObject') {
        // HTML drawn inside the SVG, as Mermaid draws its labels: coloured by
        // CSS `color`, and maybe on a box of its own.
        for (const leaf of Array.from(element.querySelectorAll<HTMLElement>('*'))) {
          if (leaf.namespaceURI !== HTML_NAMESPACE || !hasOwnText(leaf) || !isLabelShown(leaf)) {
            continue;
          }
          const boxes: SurfaceLayer[] = [];
          for (let node: Element | null = leaf; node !== null && node !== element; node = node.parentElement) {
            const background = this.parseCssColor(styleOf(node).backgroundColor);
            const parts = background === null ? null : this.splitAlpha(background);
            const rgb = parts === null ? null : this.parseColorToRgb(parts.hex);
            if (parts !== null && rgb !== null && parts.alpha > 0) {
              boxes.push({ rgb, alpha: parts.alpha * opacityOf(node) });
            }
          }
          const choice = pick(leaf, order.get(element) ?? index, boxes);
          if (choice !== null) {
            choices.push({ label: leaf, property: 'color', ...choice });
          }
        }
      }
    });

    const differs = (element: Element, property: 'fill' | 'color', color: string): boolean => {
      const shown = this.parseColorToRgb(window.getComputedStyle(element).getPropertyValue(property));
      const wanted = this.parseColorToRgb(color);
      return shown === null || wanted === null
        || shown.r !== wanted.r || shown.g !== wanted.g || shown.b !== wanted.b;
    };
    // `!important`, which a stylesheet's `!important` rule -- a Mermaid
    // classDef -- cannot beat.
    for (const choice of choices.filter(choice => differs(choice.label, choice.property, choice.color))) {
      this.overrideInlineStyle(choice.label, choice.property, choice.color, 'important');
    }
    for (const { label, property, halo } of choices) {
      if (halo !== null) {
        this.drawHalo(label, property, halo);
      }
    }
    // A span a rule colours itself, such as Mermaid's `.loopText > tspan`,
    // does not follow its label; it is given the label's colour.
    const spans = choices
      .filter(choice => choice.property === 'fill')
      .flatMap(choice => Array.from(choice.label.querySelectorAll<SVGElement>('tspan, textPath'))
        .map(span => ({ ...choice, label: span })))
      .filter(choice => differs(choice.label, 'fill', choice.color));
    for (const span of spans) {
      this.overrideInlineStyle(span.label, 'fill', span.color, 'important');
    }
  }

  /**
   * Draws a halo of `color` round a label's glyphs: a stroke painted beneath
   * an SVG text's fill, or a shadow round HTML text, which every browser
   * draws beneath it.
   */
  private drawHalo(label: HTMLElement | SVGElement, property: 'fill' | 'color', color: string): void {
    const { LABEL_HALO_WIDTH, LABEL_HALO_BLUR } = HighContrastConstants;
    if (property === 'color') {
      const shadow = `0 0 ${LABEL_HALO_BLUR} ${color}`;
      this.overrideInlineStyle(label, 'text-shadow', [shadow, shadow, shadow].join(', '), 'important');
      return;
    }
    this.overrideInlineStyle(label, 'stroke', color, 'important');
    this.overrideInlineStyle(label, 'stroke-width', LABEL_HALO_WIDTH, 'important');
    this.overrideInlineStyle(label, 'stroke-linejoin', 'round', 'important');
    this.overrideInlineStyle(label, 'paint-order', 'stroke', 'important');
  }

  /**
   * Whether text draws a halo around its glyphs: a solid stroke of some
   * width, which keeps it apart from whatever lies beneath.
   */
  private hasHalo(style: CSSStyleDeclaration): boolean {
    const stroke = style.getPropertyValue('stroke').trim();
    const parsed = stroke === '' || stroke === 'none' || stroke.startsWith('url(')
      ? null
      : this.parseCssColor(stroke);
    const parts = parsed === null ? null : this.splitAlpha(parsed);
    const width = Number.parseFloat(style.getPropertyValue('stroke-width'));
    return parts !== null && parts.alpha > 0 && width > 0;
  }

  /**
   * Whether a point, in client coordinates, falls inside a shape's fill and
   * not merely its box: a pie wedge or a diagonal band covers only part of
   * the box around it. A shape that cannot be asked is taken by its box.
   */
  private fillsPoint(element: Element, x: number, y: number): boolean {
    const shape = element as SVGGeometryElement;
    if (typeof shape.isPointInFill !== 'function' || typeof shape.getScreenCTM !== 'function') {
      return true;
    }
    const matrix = shape.getScreenCTM();
    if (matrix === null) {
      return true;
    }
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
    return shape.isPointInFill(point);
  }

  private restoreInlineStyles(): void {
    for (let i = this.inlineStyleSnapshots.length - 1; i >= 0; i--) {
      const snapshot = this.inlineStyleSnapshots[i];
      if (snapshot.value === '') {
        snapshot.element.style.removeProperty(snapshot.property);
      } else {
        snapshot.element.style.setProperty(snapshot.property, snapshot.value, snapshot.priority);
      }
      // An element given its first inline declaration here goes back to
      // having none, rather than keeping an empty style attribute.
      if (!snapshot.hadStyle && snapshot.element.getAttribute('style') === '') {
        snapshot.element.removeAttribute('style');
      }
    }
    this.inlineStyleSnapshots = [];
  }

  /**
   * Get all SVG elements from all traces in the Figure hierarchy, each with
   * the type of the layer that selects it. An element two layers select keeps
   * the first one's type, unless a later one is a bar: a bar's near-white fill
   * must stay a bar.
   */
  private getAllTraceElements(): Map<SVGElement, string> {
    if (this.traceElementsCache !== null) {
      return this.traceElementsCache;
    }

    const elements = new Map<SVGElement, string>();

    for (const subplotRow of this.figure.subplots) {
      for (const subplot of subplotRow) {
        for (const traceRow of subplot.traces) {
          for (const trace of traceRow) {
            const traceType = String(trace.traceType);
            const traceElements = trace.getAllOriginalElements();
            for (const el of traceElements) {
              if (!elements.has(el) || BAR_LIKE_TRACE_TYPES.has(traceType)) {
                elements.set(el, traceType);
              }
            }
          }
        }
      }
    }

    this.traceElementsCache = elements;
    return elements;
  }

  /**
   * The shapes the traces were read from where their highlight marks stand
   * in for them: a line's or a radar's path, whose vertices maidr marks with
   * circles of its own, so that the path is no element the layer selects.
   */
  private getTraceShapes(): Set<SVGElement> {
    const shapes = new Set<SVGElement>();
    for (const subplotRow of this.figure.subplots) {
      for (const subplot of subplotRow) {
        for (const traceRow of subplot.traces) {
          for (const trace of traceRow) {
            for (const shape of trace.getGeometryElements?.() ?? []) {
              shapes.add(shape);
            }
          }
        }
      }
    }
    return shapes;
  }

  /**
   * The plot element and any overlay layers drawn over it, each of which is
   * recoloured as a whole.
   */
  private getColorRoots(): Element[] {
    return [this.displayService.plot, ...this.getOverlayLayers()];
  }

  /**
   * The element painted behind the chart: the body when the chart has its
   * document to itself, else the chart's own article. Painting the body of a
   * page the chart shares repaints the prose, cards and slides around it,
   * and leaves text that took its colour from the body light on their light
   * boxes.
   *
   * The article is React's, but maidr renders no style on it, and this
   * service already writes inline on the plot React renders; the snapshot
   * puts back exactly what was there.
   */
  private getBackdrop(): HTMLElement {
    const plot = this.displayService.plot;
    const chart = plot.closest<HTMLElement>(CHART_ROOT_SELECTOR) ?? plot;
    const body = chart.ownerDocument.body;
    return body !== null && hasDocumentToItself(this.getChartExtent(chart))
      ? body
      : chart;
  }

  /**
   * The smallest element holding the chart and every layer drawn over it.
   * Plotly draws its title, legend and toolbar beside maidr's article, in the
   * `.svg-container` they share; those are the chart's, not the page's.
   * Layers that meet only at the body say nothing about the page, so then
   * the chart alone is the extent.
   */
  private getChartExtent(chart: Element): Element {
    let extent: Element = chart;
    for (const layer of this.getOverlayLayers()) {
      while (!extent.contains(layer) && extent.parentElement !== null) {
        extent = extent.parentElement;
      }
    }
    const body = chart.ownerDocument.body;
    return body === null || extent === body || !body.contains(extent)
      ? chart
      : extent;
  }

  /**
   * The element of the chart that carries the chart's id: the plot itself,
   * or the SVG a binding gave the id. Looked for in the chart, never on the
   * page, where another chart may carry the same id and come first.
   */
  private getChartIdElement(): Element | null {
    const plot = this.displayService.plot;
    const id = this.context.id;
    if (plot.id === id) {
      return plot;
    }
    return Array.from(plot.querySelectorAll('[id]')).find(element => element.id === id) ?? null;
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

      const traceType = traceElements.get(el as SVGElement);
      const isInSelectors = traceType !== undefined;

      const complexPath = el.getAttribute('d');
      let isComplexPath = false;
      if (complexPath) {
        isComplexPath
          = complexPath.length > HighContrastConstants.MIN_COMPLEX_PATH_LENGTH;
      }
      const cantBeBackground = isComplexPath;

      const capture = (
        value: string,
        attr: PaintProperty,
        attrType: 'style' | 'attribute' | 'computed',
      ): void => {
        const color = value.trim();
        originalColorInfo.push({
          element: el as SVGElement,
          color,
          resolvedColor: this.resolvePaint(el, attr, color),
          isInSelectors,
          traceType,
          cantBeBackground,
          attr,
          attrType,
        });
      };

      // Each paint is captured where it is shown from: an inline declaration,
      // else a stylesheet rule, which outranks a presentation attribute, else
      // the attribute. An inline declaration loses only to an `!important`
      // rule; an attribute under either paints nothing.
      const declared = { fill: styleFillMatch?.[1], stroke: styleStrokeMatch?.[1] };
      for (const attr of PAINT_PROPERTIES) {
        const inline = declared[attr];
        if (this.sheetPaints.get(el)?.has(attr) && !this.inlineOutranksRules(el, attr, inline)) {
          // Text coloured only by a rule is left to captureSurfacesAndText.
          const textFill = attr === 'fill' && TEXT_TAGS.has(el.tagName)
            && inline === undefined && !el.hasAttribute('fill');
          const computed = window.getComputedStyle(el).getPropertyValue(attr).trim();
          if (!textFill && this.resolvePaint(el, attr, computed) !== null) {
            capture(computed, attr, 'computed');
          }
          continue;
        }
        if (inline !== undefined) {
          capture(inline, attr, 'style');
          continue;
        }
        const attribute = el.getAttribute(attr);
        if (attribute) {
          capture(attribute, attr, 'attribute');
        }
      }
    }

    return originalColorInfo;
  }

  /**
   * Whether an element's inline paint is the one it shows over the rules
   * that paint it too: when it is `!important`, or shows the colour it
   * declares. An inline paint that names no colour -- `none`, a pattern --
   * outranks a rule that names none either.
   */
  private inlineOutranksRules(element: Element, attr: PaintProperty, inline: string | undefined): boolean {
    if (inline === undefined) {
      return false;
    }
    if ((element as SVGElement).style?.getPropertyPriority(attr) === 'important') {
      return true;
    }
    const computed = window.getComputedStyle(element).getPropertyValue(attr).trim();
    const own = this.resolvePaint(element, attr, inline.trim());
    return own === null
      ? this.resolvePaint(element, attr, computed) === null
      : own === this.resolvePaint(element, attr, computed);
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
   * A box drawn wholly in tints of the paper keeps an outline drawn darker
   * than its fill, which is its edge rather than the page.
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

    const backgroundHex = this.parseCssColor(this.highContrastDarkColor);
    const isBackground = (item: ElementColorInfo): boolean => {
      const parts = this.splitAlpha(this.parseCssColor(item.color) ?? '');
      return parts !== null && parts.hex === backgroundHex;
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
      if (paints.some(item => !isBackground(item) && isVisible(item))) {
        continue;
      }
      if (element.getAttribute('visibility') === 'hidden') {
        continue;
      }

      const fill = paints.find(item => item.attr === 'fill');
      const stroke = paints.find(item => item.attr === 'stroke');
      if (paints.every(item => this.isPaperPaint(item))) {
        // A page or a panel, unless it is a box drawn in tints of the paper:
        // an outline drawn darker than its own fill is the box's edge, not
        // the paper showing through -- Mermaid's railroad terminals, #ffffde
        // outlined #eeeebc. It keeps its edge light, as a box outlined in ink
        // does; a grey one is a frame, and stays faint as frames do.
        if (fill !== undefined && stroke !== undefined && isVisible(stroke) && this.outlinesFill(stroke, fill)) {
          const parts = this.splitAlpha(stroke.resolvedColor ?? '');
          const alpha = parts?.alpha ?? 1;
          const frame = parts !== null && !stroke.isInSelectors && this.isLightGrey(parts.hex);
          stroke.color = this.applyAlpha(
            this.highContrastLightColor,
            this.inkLineAlpha(alpha, frame ? alpha * HighContrastConstants.FAINT_INK_ALPHA : alpha),
          );
        }
        continue;
      }
      const lift = fill !== undefined && !this.isPaperPaint(fill)
        ? fill
        : stroke ?? fill;
      if (!lift) {
        continue;
      }
      const alpha = this.splitAlpha(lift.resolvedColor ?? '')?.alpha ?? 1;
      lift.color = this.applyAlpha(
        this.highContrastLightColor,
        lift.attr === 'stroke' ? this.inkLineAlpha(alpha, alpha) : alpha,
      );
    }
  }

  /**
   * Whether an outline is drawn visibly darker than the fill it goes round,
   * so that on the page it shows as the shape's edge.
   */
  private outlinesFill(stroke: ElementColorInfo, fill: ElementColorInfo): boolean {
    const strokeParts = this.splitAlpha(stroke.resolvedColor ?? '');
    const fillParts = this.splitAlpha(fill.resolvedColor ?? '');
    return strokeParts !== null && fillParts !== null
      && this.getRelativeLuminance(fillParts.hex) - this.getRelativeLuminance(strokeParts.hex)
      >= HighContrastConstants.PAPER_OUTLINE_MIN_STEP;
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
    return this.isPaperColor(parts.hex)
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
   * Cases each line of a chart that also draws bars in the background
   * colour, so the line reads where it crosses a bar. A bar beside a line is
   * kept light, as the line is (see getAllTraceElements), and a light line
   * drawn over a light bar is lost in it -- Mermaid's XY chart draws its line
   * over its bars. Over the backdrop the casing is lost instead, and the line
   * shows as it did. A line the page filters itself keeps its own filter.
   *
   * Each casing is a filter sized to its line in the line's own units: one
   * sized by the line's box draws nothing for a flat line, whose box has no
   * height.
   */
  private caseLinesOverBars(): void {
    const traces = this.figure.subplots.flat().flatMap(subplot => subplot.traces.flat());
    const svg = this.getPlotSvg();
    if (svg === null || !traces.some(trace => BAR_LIKE_TRACE_TYPES.has(String(trace.traceType)))) {
      return;
    }
    const lines = traces
      .filter(trace => LINE_TRACE_TYPES.has(String(trace.traceType)))
      .flatMap((trace) => {
        const shapes = trace.getGeometryElements?.() ?? [];
        return shapes.length > 0 ? shapes : trace.getAllOriginalElements();
      })
      .filter(line => !line.hasAttribute('filter') && typeof (line as SVGGraphicsElement).getBBox === 'function');

    const radius = HighContrastConstants.LINE_CASING_RADIUS;
    const make = <K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] => {
      const element = document.createElementNS(SVG_NAMESPACE, tag);
      for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
      }
      return element;
    };
    for (const line of lines) {
      let box: DOMRect;
      try {
        box = (line as SVGGraphicsElement).getBBox();
      } catch {
        // Not rendered, so there is nothing to case.
        continue;
      }
      const width = Number.parseFloat(window.getComputedStyle(line).strokeWidth);
      const margin = (Number.isNaN(width) ? 1 : width) / 2 + radius + 1;
      const filter = make('filter', {
        id: `${this.context.id}-line-casing-${this.lineCasings.length}`,
        filterUnits: 'userSpaceOnUse',
        x: box.x - margin,
        y: box.y - margin,
        width: box.width + 2 * margin,
        height: box.height + 2 * margin,
      });
      const merge = make('feMerge', {});
      merge.append(make('feMergeNode', {}), make('feMergeNode', { in: 'SourceGraphic' }));
      filter.append(
        make('feMorphology', { in: 'SourceAlpha', operator: 'dilate', radius, result: 'casing' }),
        make('feFlood', { 'flood-color': this.highContrastDarkColor }),
        make('feComposite', { in2: 'casing', operator: 'in' }),
        merge,
      );
      let defs = svg.querySelector('defs');
      if (defs === null) {
        defs = document.createElementNS(SVG_NAMESPACE, 'defs');
        svg.insertBefore(defs, svg.firstChild);
      }
      defs.appendChild(filter);
      line.setAttribute('filter', `url(#${filter.id})`);
      this.lineCasings.push({ line, filter });
    }
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
    const isPaper = this.isPaperColor(original.hex);

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

    // Decided per element, from the layer that selects it: a chart with
    // several layers or panels has no single type, and its bars are bars all
    // the same.
    const useNearWhite = colorInfo.traceType !== undefined
      && BAR_LIKE_TRACE_TYPES.has(colorInfo.traceType);

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
          ? this.applyAlpha(
              this.highContrastLightColor,
              this.inkLineAlpha(original.alpha, original.alpha * HighContrastConstants.FAINT_INK_ALPHA),
            )
          : withAlpha(this.highContrastDarkColor);
      }
    }

    // Any other paint maps across the ramp; keepShapesVisible then lifts any
    // shape this leaves wholly in the background colour.
    const mapped = this.findClosestColor(
      hex,
      colorEquivalents,
      useNearWhite,
      nearWhiteScale,
      // A long path must not vanish as a line, but a tiled area is read
      // against its neighbours whichever end it takes.
      colorInfo.cantBeBackground && !(this.isTiledMark(colorInfo) && colorInfo.attr === 'fill'),
    );
    const inkLine = colorInfo.attr === 'stroke' && !this.isTiledMark(colorInfo)
      && this.parseCssColor(mapped) !== this.parseCssColor(this.highContrastDarkColor);
    return inkLine
      ? this.applyAlpha(mapped, this.inkLineAlpha(original.alpha, original.alpha))
      : withAlpha(mapped);
  }

  /**
   * The opacity a line drawn in ink is given: its own, but no less than a
   * faint gridline's. An outline drawn faintly on a light page -- Mermaid
   * outlines a block diagram's composites at 0.2 -- drawn that faintly on
   * the dark backdrop is under 2:1, fainter than any gridline. A hit area
   * drawn at near-zero opacity stays invisible.
   *
   * @param original - The opacity the chart drew the line at
   * @param drawn - The opacity it would be drawn at otherwise
   */
  private inkLineAlpha(original: number, drawn: number): number {
    return original < HighContrastConstants.MIN_SURFACE_ALPHA
      ? drawn
      : Math.max(drawn, HighContrastConstants.FAINT_INK_ALPHA);
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

  /**
   * A colour of the paper: near-white, and nearly colourless. Luminance
   * alone would take a pale yellow, drawn as a series or a section, for the
   * page showing through, and paint it the background colour.
   */
  private isPaperColor(hex: string): boolean {
    const rgb = this.parseColorToRgb(hex);
    if (!rgb) {
      return false;
    }
    const spread = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    return spread <= HighContrastConstants.PAPER_MAX_CHANNEL_SPREAD
      && this.isNearWhite(hex, HighContrastConstants.NEAR_WHITE_LUMINANCE_SCALE);
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
    textDescendants: Map<Element, boolean>,
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

    // The marks are the elements the layers select, and the shapes a layer
    // was read from where its highlight marks stand in for them: a radar's
    // curves, whose vertices maidr marks with circles of its own.
    const shapes = this.getTraceShapes();
    const isMarkFill = (item: ElementColorInfo): boolean =>
      (item.isInSelectors || shapes.has(item.element)) && item.attr === 'fill' && item.resolvedColor !== null;

    const elementToHighContrastColor = new Map<SVGElement, string>();
    for (const item of highContrastElInfo) {
      if (isMarkFill(item)) {
        elementToHighContrastColor.set(item.element, item.color);
      }
    }

    const colorGroups = new Map<string, ElementColorInfo[]>();

    for (const item of this.originalColorInfo) {
      if (isMarkFill(item)) {
        const normalizedColor = this.normalizeColor(item.resolvedColor ?? item.color);
        if (!colorGroups.has(normalizedColor)) {
          colorGroups.set(normalizedColor, []);
        }
        colorGroups.get(normalizedColor)!.push(item);
      }
    }

    const keys = this.legendKeys(colorGroups, shapes, textDescendants);

    let patternIndex = 0;
    for (const [color, elements] of colorGroups) {
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

      // A key takes its marks' pattern -- the same one, from the cache -- so
      // the legend still says which pattern is which series.
      const baseColor = elementToHighContrastColor.get(elements[0].element) || this.highContrastLightColor;
      for (const key of keys.get(color) ?? []) {
        this.patternService.applyPattern(key.element, {
          type: patternType,
          baseColor,
          patternColor: this.getMostContrastingColor(baseColor),
        });
      }

      patternIndex++;
    }
  }

  /**
   * The legend keys of each group of marks: a shape no layer selects or was
   * read from, drawn after the group's first mark in exactly its colour. Mermaid, matplotlib,
   * ggplot and Plotly all draw the legend after the marks, and a background
   * or panel before them. A key of white, the paper's colour, is not told
   * from the frame around the legend, and keeps its plain colour.
   */
  private legendKeys(
    colorGroups: Map<string, ElementColorInfo[]>,
    shapes: Set<SVGElement>,
    textDescendants: Map<Element, boolean>,
  ): Map<string, ElementColorInfo[]> {
    const keys = new Map<string, ElementColorInfo[]>();
    for (const item of this.originalColorInfo ?? []) {
      if (item.isInSelectors || shapes.has(item.element) || item.attr !== 'fill' || item.resolvedColor === null
        || !SWATCH_TAGS.has(item.element.tagName) || this.isTextDescendant(item.element, textDescendants)
        || isInMaidrCopy(item.element)) {
        continue;
      }
      const color = this.normalizeColor(item.resolvedColor);
      const marks = colorGroups.get(color);
      if (marks === undefined || color === '#ffffff'
        || !(marks[0].element.compareDocumentPosition(item.element) & Node.DOCUMENT_POSITION_FOLLOWING)) {
        continue;
      }
      keys.set(color, [...(keys.get(color) ?? []), item]);
    }
    return keys;
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
