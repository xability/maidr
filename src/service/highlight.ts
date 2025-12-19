import type { Context } from "@model/context";
import type { Figure } from "@model/plot";
import type { SettingsService } from "@service/settings";
import type { Disposable } from "@type/disposable";
import type { Observer } from "@type/observable";
import type { Settings } from "@type/settings";
import { DisplayService } from "@service/display";
import type {
  FigureState,
  HighlightState,
  SubplotState,
  TraceState,
} from "@type/state";
import { Constant } from "@util/constant";
import { Svg } from "@util/svg";
import { NotificationService } from "@service/notification";
import { original } from "@reduxjs/toolkit";

type HighlightStateUnion = SubplotState | TraceState | FigureState | Settings;
type ElementColorInfo = {
  element: SVGElement;
  color: string;
  isInSelectors: boolean;
  cantBeBackground: boolean;
  attr: string;
  attrType?: "style" | "attribute";
};

export class HighlightService
  implements Observer<HighlightStateUnion>, Observer<Settings>, Disposable
{
  private readonly settingsSerivice: SettingsService;
  private readonly notificationService: NotificationService;
  private readonly displayService: DisplayService;
  private readonly figure: Figure;

  private readonly highlightedElements: Map<SVGElement, SVGElement>;
  private readonly highlightedSubplots: Set<SVGElement>;
  private currentHighlightColor: string;

  private highContrastMode: boolean = false;
  private defaultBackgroundColor: string = "";
  private defaultForegroundColor: string = "";
  private highContrastLightColor: string = "#ffffff"; // default to white
  private highContrastDarkColor: string = "#000000"; // default to black
  private highContrastLevels: number = 2; // default to 2 levels (black and white)
  private colorEquivalents: string[] = [];
  private originalColorInfo: ElementColorInfo[] | null = [];

  // Cache of all trace elements for high contrast mode
  private traceElementsCache: Set<SVGElement> | null = null;

  public constructor(
    settings: SettingsService,
    notification: NotificationService,
    displayService: DisplayService,
    figure: Figure,
  ) {
    this.settingsSerivice = settings;
    this.notificationService = notification;
    this.displayService = displayService;
    this.settingsSerivice = settings;
    this.notificationService = notification;
    this.figure = figure;

    this.highlightedElements = new Map();
    this.highlightedSubplots = new Set();

    const initialSettings = this.settingsSerivice.loadSettings();
    this.currentHighlightColor = initialSettings.general.highlightColor;
    this.highContrastLevels = initialSettings.general.highContrastLevels;
    this.highContrastLightColor =
      initialSettings.general.highContrastLightColor;
    this.highContrastDarkColor = initialSettings.general.highContrastDarkColor;

    this.colorEquivalents = this.interpolateColors(
      this.highContrastLightColor,
      this.highContrastDarkColor,
      this.highContrastLevels,
    );

    this.originalColorInfo = this.getOriginalColorInfo();

    // Register as observer to listen for settings changes
    this.settingsSerivice.addObserver(this);
  }

  public dispose(): void {
    this.unhighlightAll();
  }

  private isSettings(state: HighlightStateUnion): state is Settings {
    return "general" in state;
  }

  private createHighlightElement(element: SVGElement): SVGElement {
    if (!(element instanceof SVGElement)) {
      throw new TypeError("Invalid element provided for highlight creation");
    }

    const clone = Svg.createHighlightElement(
      element,
      this.currentHighlightColor,
    );
    clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
    return clone;
  }

  private handleSettingsUpdate(settings: Settings): void {
    // update if settings stuff changed

    this.currentHighlightColor = settings.general.highlightColor;
    this.highContrastLevels = settings.general.highContrastLevels;
    this.highContrastLightColor = settings.general.highContrastLightColor;
    this.highContrastDarkColor = settings.general.highContrastDarkColor;
    this.highContrastMode = settings.general.highContrastMode;
  }

  private handleStateUpdate(
    state: SubplotState | TraceState | FigureState,
  ): void {
    if (state.empty) {
      return;
    }

    this.unhighlightTraceElements();

    if (state.type === "figure") {
      this.handleFigureState(state);
    } else if (state.type === "subplot") {
      this.handleSubplotState(state);
    } else {
      this.handleTraceState(state);
    }
  }

  private handleFigureState(state: FigureState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  private handleSubplotState(state: SubplotState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  private handleTraceState(state: TraceState): void {
    if (state.empty || state.highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(state.highlight);
    this.highlightTraceElements(elements);
  }

  public toggleHighContrast(
    context: Context,
    displayService: DisplayService,
  ): void {
    // toggle high contrast mode on/off
    // triggered by hotkey 'c' through factory / toggle

    this.highContrastMode = !this.highContrastMode;
    this.updateContrastDisplay(context, displayService);

    const message = `High Contrast Mode ${this.highContrastMode ? "on" : "off"}`;
    this.notificationService.notify(message);
  }

  /**
   * Get all SVG elements from all traces in the Figure hierarchy.
   * Uses the MVCC-compliant approach of traversing Figure → Subplot → Trace.
   * Results are cached for performance.
   * @returns Set of all trace SVG elements
   */
  private getAllTraceElements(): Set<SVGElement> {
    // Return cached result if available
    if (this.traceElementsCache !== null) {
      return this.traceElementsCache;
    }

    const elements = new Set<SVGElement>();

    // Traverse Figure → Subplot → Trace hierarchy
    for (const subplotRow of this.figure.subplots) {
      for (const subplot of subplotRow) {
        for (const traceRow of subplot.traces) {
          for (const trace of traceRow) {
            // Use the new public method to get all highlight elements
            const traceElements = trace.getAllHighlightElements();
            for (const el of traceElements) {
              elements.add(el);
            }
          }
        }
      }
    }

    // Cache the result
    this.traceElementsCache = elements;
    return elements;
  }

  /**
   * Clear the trace elements cache.
   * Should be called when traces are updated.
   */
  private clearTraceElementsCache(): void {
    this.traceElementsCache = null;
  }

  /**
   * Check if an element is part of the chart data (trace elements).
   * Uses direct element lookup instead of CSS selector matching.
   * @param element The element to check
   * @param traceElements Set of known trace elements
   * @returns true if the element is a trace element
   */
  private isTraceElement(
    element: Element,
    traceElements: Set<SVGElement>,
  ): boolean {
    return traceElements.has(element as SVGElement);
  }

  private updateContrastDisplay(
    context: Context,
    displayService: DisplayService,
  ): void {
    // todo, use 008A00 as default highlight color during high contrast mode
    // future todo: for 2 tone, use opposite color for highlight
    // if more than 2, use the furthest away

    const svg = displayService.plot;

    if (!svg) return;

    const svgElements = svg.querySelectorAll("*");

    if (!this.highContrastMode) {
      // turn off high contrast mode, restore original colors

      document.body.style.backgroundColor = this.defaultBackgroundColor;
      document.body.style.color = this.defaultForegroundColor;

      this.originalColorInfo?.forEach((item) => {
        if (item.element && item.attrType === "style") {
          const style = item.element.getAttribute("style") || "";
          const newStyle = style.replace(
            new RegExp(`${item.attr}:\\s*[^;]+`, "i"),
            `${item.attr}:${item.color}`,
          );
          item.element.setAttribute("style", newStyle);
        } else if (item.element && item.attrType === "attribute") {
          item.element.setAttribute(item.attr, item.color);
        }

        // Remove text shadow filter
        if (item.element.getAttribute("filter") === "url(#glow-shadow)") {
          item.element.removeAttribute("filter");
        }
      });

      // exceptions
      // line
      if ("type" in context.instructionContext) {
        if (context.instructionContext.type === "line") {
          document
            .getElementById(context.id)
            ?.classList.remove("high-contrast");
        }
      }

      // text stuff, like axis labels, titles, etc
      this.displayService.plot.setAttribute(
        "style",
        "fill:" + this.defaultForegroundColor,
      );
    } else {
      // turn on high contrast mode

      // anything that's a selector: find the closest color in our set but reverse it.
      // anything else: find the closest color but don't reverse it
      // exception: background and text color, reverse

      const bodyStyle = window.getComputedStyle(document.body);
      this.defaultBackgroundColor = bodyStyle.backgroundColor;
      this.defaultForegroundColor = bodyStyle.color;
      document.body.style.backgroundColor = this.highContrastDarkColor;
      document.body.style.color = this.highContrastLightColor;

      // get high contrast colors
      const highContrastColors = this.getHighContrastColors(context);

      // apply high contrast colors
      for (let i = 0; i < highContrastColors.length; i++) {
        const item = highContrastColors[i];
        if (item.element && item.attrType === "style") {
          const style = item.element.getAttribute("style") || "";
          const newStyle = style.replace(
            new RegExp(`${item.attr}:\\s*[^;]+`, "i"),
            `${item.attr}:${item.color}`,
          );
          item.element.setAttribute("style", newStyle);
        } else if (item.element && item.attrType === "attribute") {
          item.element.setAttribute(item.attr, item.color);
        }
      }

      // exceptions:

      // add text shadow filter, if it doesn't exist
      this.addGlowShadowFilter(this.displayService.plot);

      this.originalColorInfo?.forEach((item) => {
        // text elements need a shadow and be light text
        if (this.hasParentWithStringInID(item.element, "text")) {
          item.element.setAttribute("filter", "url(#glow-shadow)");
        }
      });

      if ("type" in context.instructionContext) {
        if (context.instructionContext.type === "line") {
          document.getElementById(context.id)?.classList.add("high-contrast");
        }
      }

      // text stuff, like axis labels, titles, etc
      this.displayService.plot.setAttribute(
        "style",
        "fill:" + this.highContrastLightColor,
      );

      // bookmark:
      // finish color work, not tested yet
      // proper selectors, N working but me too
      // meeting answer: force levels grayscale to fit all needed colors for stuff like stacked
    }
  }

  private getOriginalColorInfo(): ElementColorInfo[] | null {
    const svg = this.displayService.plot;
    if (!svg) return null;
    const svgElements = svg.querySelectorAll("*");

    // Get all trace elements using MVCC-compliant approach
    const traceElements = this.getAllTraceElements();

    const originalColorInfo: ElementColorInfo[] = [];

    for (let i = 0; i < svgElements.length; i++) {
      const el = svgElements[i];
      // Check style attribute for fill and stroke
      const style = el.getAttribute("style") || "";
      const styleFillMatch = style.match(/fill:\s*([^;]+)/i);
      const styleStrokeMatch = style.match(/stroke:\s*([^;]+)/i);

      const isInSelectors = this.isTraceElement(el, traceElements);

      // exceptions: we don't want these to be the same as background color
      const complexPath = el.getAttribute("d");
      let isComplexPath = false;
      if (complexPath) {
        isComplexPath = complexPath.length > 120;
      }
      const cantBeBackground = isComplexPath; // more exceptions can be added here

      if (styleFillMatch) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: styleFillMatch[1].trim(),
          isInSelectors: isInSelectors,
          cantBeBackground: cantBeBackground,
          attr: "fill",
          attrType: "style",
        });
      }
      if (styleStrokeMatch) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: styleStrokeMatch[1].trim(),
          isInSelectors: isInSelectors,
          cantBeBackground: cantBeBackground,
          attr: "stroke",
          attrType: "style",
        });
      }

      // Check fill and stroke attributes
      const attrFill = el.getAttribute("fill");
      if (attrFill) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: attrFill.trim(),
          isInSelectors: isInSelectors,
          cantBeBackground: cantBeBackground,
          attr: "fill",
          attrType: "attribute",
        });
      }
      const attrStroke = el.getAttribute("stroke");
      if (attrStroke) {
        originalColorInfo.push({
          element: el as SVGElement,
          color: attrStroke.trim(),
          isInSelectors: isInSelectors,
          cantBeBackground: cantBeBackground,
          attr: "stroke",
          attrType: "attribute",
        });
      }
    }

    return originalColorInfo;
  }

  private getHighContrastColors(context: Context): ElementColorInfo[] {
    const originalColors = this.originalColorInfo;
    if (!originalColors) return [];

    // Spread out the colors to fill the full color range
    // by modifying luminance (keep hue) accordingly.
    const spreadColors =
      this.spreadColorsAcrossLuminanceSpectrum(originalColors);

    // return the final colors, running toColorStep on each
    const highContrastColors = spreadColors.map((item) => ({
      ...item,
      color: this.toColorStep(item, context),
    }));

    return highContrastColors;
  }

  /**
   * Checks if any parent element has an ID starting with 'text',
   * traversing up the DOM tree until reaching an SVG or BODY element.
   */
  private hasParentWithStringInID(
    el: Element,
    searchString: string = "",
    notString: string = "",
  ): boolean {
    let current = el.parentElement;

    while (current) {
      // Stop if we reach SVG or BODY
      if (current.tagName === "svg" || current.tagName === "BODY") {
        break;
      }

      // stop if we reach notString
      if (notString.length > 0) {
        if (current.id.startsWith(notString)) {
          return false;
        }
      }

      // Check if current element's ID starts with the search string
      if (searchString.length > 0) {
        if (current.id.startsWith(searchString)) {
          return true;
        }
      }

      // Move up to next parent
      current = current.parentElement;
    }

    return false;
  }

  // creates a text shadow type filter for high contrast mode
  private addGlowShadowFilter(svgHtml: HTMLElement): void {
    const svg = svgHtml as unknown as SVGSVGElement;

    // Check if filter already exists
    if (svg.querySelector("#glow-shadow")) {
      return;
    }

    // Find or create <defs> element
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }

    // Create the filter element
    const filter = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "filter",
    );
    filter.setAttribute("id", "glow-shadow");
    filter.setAttribute("x", "-50%");
    filter.setAttribute("y", "-50%");
    filter.setAttribute("width", "200%");
    filter.setAttribute("height", "200%");

    // Create all the filter primitives
    const filterHTML = `
    
    <feGaussianBlur in="SourceAlpha" stdDeviation="20" result="blur1"/>
    <feOffset dx="0" dy="0" result="offsetblur1" in="blur1"/>
    <feFlood flood-color="black" result="color1"/>
    <feComposite in="color1" in2="offsetblur1" operator="in" result="shadow1"/>
    
    <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur2"/>
    <feOffset dx="0" dy="0" result="offsetblur2" in="blur2"/>
    <feFlood flood-color="black" result="color2"/>
    <feComposite in="color2" in2="offsetblur2" operator="in" result="shadow2"/>
    
    <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur3"/>
    <feOffset dx="0" dy="0" result="offsetblur3" in="blur3"/>
    <feFlood flood-color="black" result="color3"/>
    <feComposite in="color3" in2="offsetblur3" operator="in" result="shadow3"/>
    
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur4"/>
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
  }

  /*
    // we redo the color using the number of levels supplied,
    // and user chosen light and dark colors,
    // and return a new color
    // we pick the closest color match

    // exception: if the incoming color is close to white,
    // (for bar, stacked bar, dodged bar, segmented bar charts)
    // we return the lightest color and spread the rest accordingly

    // exception: sometimes we don't want the color to be the same as background,
    // so we reduce the array of possible colors by 1 (0 being background color)
    */
  private toColorStep(colorInfo: ElementColorInfo, context: Context): string {
    // exceptions first
    // back out if the value is not a valid color
    const value = colorInfo.color;
    if (value === "none" || value === "transparent") {
      return value;
    }
    // text elements are always light color with shadow, do light here
    if (this.hasParentWithStringInID(colorInfo.element, "text")) {
      return this.highContrastLightColor;
    }

    // make a deep copy otherwise we'll mess up the original
    let colorEquivalents = [...this.colorEquivalents];

    // converting chart hex color to rgb (supports hexa with alpha, blends against white)
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return value;
    ctx.fillStyle = "#000"; // placeholder to init
    ctx.fillStyle = value.trim();
    let hex = ctx.fillStyle;

    // Check for 8-digit hexa format (with alpha channel)
    if (/^#[0-9a-f]{8}$/i.test(hex)) {
      // Extract RGB and alpha from hexa
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const a = parseInt(hex.slice(7, 9), 16) / 255;

      // Blend against white background (255, 255, 255)
      const blendedR = Math.round(r * a + 255 * (1 - a));
      const blendedG = Math.round(g * a + 255 * (1 - a));
      const blendedB = Math.round(b * a + 255 * (1 - a));

      // Convert back to 6-digit hex
      hex = `#${blendedR.toString(16).padStart(2, "0")}${blendedG.toString(16).padStart(2, "0")}${blendedB.toString(16).padStart(2, "0")}`;
    } else if (!/^#[0-9a-f]{6}$/i.test(hex)) {
      return value;
    }

    // do we use near white strat? check luminance and chart type
    let useNearWhite = false; // don't need for most chart types, default to false
    const nearWhiteScale = 0.1; // 10% of white, = 90% white
    // If the color is close to white, return white
    if ("type" in context.instructionContext) {
      if (
        context.instructionContext.type === "bar" ||
        context.instructionContext.type === "histogram"
      ) {
        if (colorInfo.isInSelectors) {
          useNearWhite = true;
        }
      }
    }

    // now we have the right set of colors to compare our current color to

    // next, get color equivalents, interpolated from user chosen light/dark colors and number of levels
    // if we're using near white strat, we adjust the light color to be near white

    // get closest color from equivalents
    const outputColorHex = this.findClosestColor(
      value,
      colorEquivalents,
      useNearWhite,
      nearWhiteScale,
      colorInfo.isInSelectors,
      colorInfo.cantBeBackground,
    );

    return outputColorHex;
  }

  /**
   * Finds the closest color in an array to the input color.
   * Uses Euclidean distance in RGB space.
   *
   * When useNearWhite is true, colorArray[0] is reserved for "near-white" input colors.
   * Near-white is determined by luminance: if input luminance >= 255 * (1 - nearWhiteScale),
   * return colorArray[0]. All other colors match against colorArray[1..end] using RGB distance.
   *
   * The matching color is reversed in the output array to favor dark mode by default.
   * @param inputColor - The input color (hex, rgb, or named color)
   * @param colorArray - Array of colors to match against
   * @param useNearWhite - Whether to use the near-white strategy
   * @param nearWhiteScale - Scale factor for near-white threshold (0 to 1)
   * @param isInSelectors - Whether the element is in user-defined selectors
   * @param cantBeBackground - Whether the color cannot match the background color
   * @returns The closest matching color from colorArray
   */
  private findClosestColor(
    inputColor: string,
    colorArray: string[],
    useNearWhite: boolean,
    nearWhiteScale: number,
    isInSelectors: boolean,
    cantBeBackground: boolean,
  ): string {
    if (colorArray.length === 0) {
      throw new Error("Color array cannot be empty");
    }

    const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
      const normalized = hex.replace("#", "");
      return {
        r: parseInt(normalized.slice(0, 2), 16),
        g: parseInt(normalized.slice(2, 4), 16),
        b: parseInt(normalized.slice(4, 6), 16),
      };
    };

    const getLuminance = (rgb: { r: number; g: number; b: number }): number => {
      return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    };

    const colorDistance = (
      c1: { r: number; g: number; b: number },
      c2: { r: number; g: number; b: number },
    ): number => {
      return Math.sqrt(
        Math.pow(c1.r - c2.r, 2) +
          Math.pow(c1.g - c2.g, 2) +
          Math.pow(c1.b - c2.b, 2),
      );
    };

    const inputRgb = hexToRgb(inputColor);

    // If this color can't be the same as background, remove the closest match to background from options
    if (cantBeBackground) {
      const backgroundIndex = colorArray.indexOf(this.highContrastDarkColor);
      if (backgroundIndex !== -1) {
        colorArray.splice(backgroundIndex, 1);
      }
    }

    // If useNearWhite is enabled, check if input color is in the near-white zone
    if (useNearWhite) {
      const inputLuminance = getLuminance(inputRgb);
      const nearWhiteThreshold = 255 * (1 - nearWhiteScale);

      // If input is near-white, return the reserved first color
      if (inputLuminance >= nearWhiteThreshold) {
        return colorArray[0];
      }

      // Otherwise, find closest match in colorArray[1..end]
      if (colorArray.length === 1) {
        // Only one color available, return it
        return colorArray[0];
      }

      let closestColor = colorArray[0];
      if (colorArray.length > 1) {
        let minDistance = colorDistance(inputRgb, hexToRgb(colorArray[1]));

        for (let i = 1; i < colorArray.length; i++) {
          const distance = colorDistance(inputRgb, hexToRgb(colorArray[i]));
          if (distance < minDistance) {
            minDistance = distance;
            closestColor = colorArray[i];
          }
        }
      }

      return closestColor;
    } else {
      // Standard behavior: find closest across entire array
      let closestColor = colorArray[0];
      let minDistance = colorDistance(inputRgb, hexToRgb(colorArray[0]));

      for (let i = 1; i < colorArray.length; i++) {
        const distance = colorDistance(inputRgb, hexToRgb(colorArray[i]));
        if (distance < minDistance) {
          minDistance = distance;
          closestColor = colorArray[i];
        }
      }

      // reverse the selection, as we want dark mode by default
      const index = colorArray.indexOf(closestColor);
      const reversedIndex = colorArray.length - 1 - index;
      return colorArray[reversedIndex];
    }
  }

  /**
   * Generates an array of colors evenly interpolated between two colors.
   * @param startColor - The starting color (hex, rgb, or named color)
   * @param endColor - The ending color (hex, rgb, or named color)
   * @param count - Number of colors to generate (minimum 2)
   * @returns Array of hex color strings
   */
  public interpolateColors(
    startColor: string,
    endColor: string,
    count: number,
  ): string[] {
    // Minimum of 2 colors
    const numColors = Math.max(2, Math.floor(count));

    // Parse colors to RGB
    const startRgb = this.parseColorToRgb(startColor);
    const endRgb = this.parseColorToRgb(endColor);

    if (!startRgb || !endRgb) {
      // If parsing fails, return the original colors
      return [startColor, endColor];
    }

    // If only 2 colors requested, return start and end
    if (numColors === 2) {
      return [startColor, endColor];
    }

    const colors: string[] = [];

    // Helper to interpolate at a given t value (0 to 1)
    const interpolateAt = (t: number): string => {
      const r = Math.round(startRgb.r + t * (endRgb.r - startRgb.r));
      const g = Math.round(startRgb.g + t * (endRgb.g - startRgb.g));
      const b = Math.round(startRgb.b + t * (endRgb.b - startRgb.b));
      return this.rgbToHex({ r, g, b });
    };

    // Standard linear interpolation across full range
    for (let i = 0; i < numColors; i++) {
      const t = i / (numColors - 1);
      colors.push(interpolateAt(t));
    }

    return colors;
  }

  /**
   * Parses a color string to RGB values.
   * Supports hex (#RGB, #RRGGBB), rgb(), and named colors.
   */
  private parseColorToRgb(
    color: string,
  ): { r: number; g: number; b: number } | null {
    const trimmed = color.trim();

    // Use canvas to parse any valid CSS color
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#000";
    ctx.fillStyle = trimmed;
    const hex = ctx.fillStyle;

    // Canvas normalizes to #RRGGBB format
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      return {
        r: Number.parseInt(hex.slice(1, 3), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        b: Number.parseInt(hex.slice(5, 7), 16),
      };
    }

    return null;
  }

  /**
   * Converts RGB values to a hex color string.
   */
  private rgbToHex(rgb: { r: number; g: number; b: number }): string {
    const toHex = (n: number): string => {
      const clamped = Math.max(0, Math.min(255, n));
      return clamped.toString(16).padStart(2, "0");
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  /**
   * Spreads colors proportionally across the full luminance spectrum.
   * For items where isInSelectors is true, their luminances are remapped
   * to fill the entire 0-100% range while preserving relative ordering.
   *
   * @param colorInfos - Array of ElementColorInfo to process
   * @returns New array with colors updated for isInSelectors items
   */
  private spreadColorsAcrossLuminanceSpectrum(
    colorInfos: ElementColorInfo[],
  ): ElementColorInfo[] {
    // Helper to convert RGB to HSL
    const rgbToHsl = (rgb: {
      r: number;
      g: number;
      b: number;
    }): { h: number; s: number; l: number } => {
      const r = rgb.r / 255;
      const g = rgb.g / 255;
      const b = rgb.b / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      if (max === min) {
        return { h: 0, s: 0, l };
      }

      const d = max - min;
      const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      let h = 0;
      if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
      } else {
        h = ((r - g) / d + 4) / 6;
      }

      return { h, s, l };
    };

    // Helper to convert HSL to RGB
    const hslToRgb = (hsl: {
      h: number;
      s: number;
      l: number;
    }): { r: number; g: number; b: number } => {
      const { h, s, l } = hsl;

      if (s === 0) {
        const gray = Math.round(l * 255);
        return { r: gray, g: gray, b: gray };
      }

      const hue2rgb = (p: number, q: number, t: number): number => {
        let tNorm = t;
        if (tNorm < 0) tNorm += 1;
        if (tNorm > 1) tNorm -= 1;
        if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
        if (tNorm < 1 / 2) return q;
        if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      return {
        r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hue2rgb(p, q, h) * 255),
        b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
      };
    };

    // Collect items that are in selectors with their luminances
    const selectorItems: {
      index: number;
      luminance: number;
      hsl: { h: number; s: number; l: number };
    }[] = [];

    for (let i = 0; i < colorInfos.length; i++) {
      const item = colorInfos[i];
      // Skip non-color values
      if (item.color === "none" || item.color === "transparent") {
        continue;
      }
      if (item.isInSelectors) {
        const rgb = this.parseColorToRgb(item.color);
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

    // If no selector items or only one, return copy as-is
    if (selectorItems.length <= 1) {
      return colorInfos.map((item) => ({ ...item }));
    }

    // Find min and max luminance among selector items
    const luminances = selectorItems.map((item) => item.luminance);
    const minLum = Math.min(...luminances);
    const maxLum = Math.max(...luminances);
    const lumRange = maxLum - minLum;

    // Create result array as copy
    const result: ElementColorInfo[] = colorInfos.map((item) => ({ ...item }));

    // Spread luminances proportionally to fill 0-1 range
    for (const selectorItem of selectorItems) {
      let newLuminance: number;

      if (lumRange === 0) {
        // All same luminance, spread evenly
        newLuminance = 0.5;
      } else {
        // Map original luminance proportionally to full 0-1 range
        // Original: minLum -> maxLum
        // New: 0 -> 1
        const normalizedPosition = (selectorItem.luminance - minLum) / lumRange;
        newLuminance = normalizedPosition;
      }

      // Create new color with adjusted luminance, preserving hue and saturation
      const newHsl = {
        h: selectorItem.hsl.h,
        s: selectorItem.hsl.s,
        l: newLuminance,
      };
      const newRgb = hslToRgb(newHsl);
      const newColor = this.rgbToHex(newRgb);

      result[selectorItem.index].color = newColor;
    }

    return result;
  }
  private processHighlighting(highlight: HighlightState): void {
    if (highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(highlight);
    const isMultiPlot = this.isMultiPlotScenario();

    if (isMultiPlot) {
      this.highlightSubplotElements(elements);
    } else {
      this.unhighlightSubplotElements();
    }
  }

  private getElementsFromHighlight(highlight: HighlightState): SVGElement[] {
    if (highlight.empty) {
      return [];
    }
    return Array.isArray(highlight.elements)
      ? highlight.elements
      : [highlight.elements];
  }

  private isMultiPlotScenario(): boolean {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;
    return totalSubplots > 1;
  }

  private highlightTraceElements(elements: SVGElement[]): void {
    for (const element of elements) {
      try {
        const highlightElement = this.createHighlightElement(element);
        this.highlightedElements.set(element, highlightElement);
      } catch (error) {
        console.error("Failed to highlight element:", error);
      }
    }
  }

  private highlightSubplotElements(elements: SVGElement[]): void {
    this.unhighlightSubplotElements();
    const figure = document.querySelector(
      'g[id^="maidr-"] > path[style*="fill"]',
    )?.parentElement as SVGElement | null;
    const figureBgElement =
      (figure?.querySelector('path[style*="fill"]') as SVGElement) || undefined;
    for (const element of elements) {
      Svg.setSubplotHighlightSvgWithAdaptiveColor(
        element,
        this.currentHighlightColor,
        figureBgElement,
      );
      this.highlightedSubplots.add(element);
    }
  }

  public update(state: HighlightStateUnion): void {
    try {
      if (this.isSettings(state)) {
        this.handleSettingsUpdate(state);
      } else {
        this.handleStateUpdate(state);
      }
    } catch (error) {
      console.error("Failed to update highlight service:", error);
    }
  }

  public highlight(element: SVGElement): void {
    if (!(element instanceof SVGElement)) {
      console.warn("Invalid element provided to highlight method");
      return;
    }

    try {
      this.unhighlight(element);
      const highlightElement = this.createHighlightElement(element);
      this.highlightedElements.set(element, highlightElement);
    } catch (error) {
      console.error("Failed to highlight element:", error);
    }
  }

  public unhighlight(element: SVGElement): void {
    if (!(element instanceof SVGElement)) {
      return;
    }

    const highlightElement = this.highlightedElements.get(element);
    if (highlightElement) {
      try {
        highlightElement.remove();
        this.highlightedElements.delete(element);
      } catch (error) {
        console.error("Failed to unhighlight element:", error);
      }
    }
  }

  public clear(): void {
    try {
      this.highlightedElements.forEach((highlightElement) => {
        highlightElement.remove();
      });
      this.highlightedElements.clear();
      this.unhighlightSubplotElements();
    } catch (error) {
      console.error("Failed to clear highlights:", error);
    }
  }

  private unhighlightTraceElements(): void {
    this.highlightedElements.forEach((highlightElement) => {
      highlightElement.remove();
    });
    this.highlightedElements.clear();
  }

  private unhighlightSubplotElements(): void {
    this.highlightedSubplots.forEach((element) => {
      Svg.removeSubplotHighlightSvg(element);
    });
    this.highlightedSubplots.clear();
  }

  private unhighlightAll(): void {
    this.unhighlightTraceElements();
    this.unhighlightSubplotElements();
  }
}
