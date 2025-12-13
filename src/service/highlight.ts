import type { Context } from "@model/context";
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
import { use } from "react";

type HighlightStateUnion = SubplotState | TraceState | FigureState | Settings;

export class HighlightService
  implements Observer<HighlightStateUnion>, Observer<Settings>, Disposable
{
  private readonly highlightedElements: Map<SVGElement, SVGElement>;
  private readonly highlightedSubplots: Set<SVGElement>;
  private currentHighlightColor: string;
  private readonly settingsSerivice: SettingsService;

  private highContrastMode: boolean = false;
  private defaultBackgroundColor: string = "";
  private defaultForegroundColor: string = "";
  private highContrastLightColor: string = "#ffffff"; // default to white
  private highContrastDarkColor: string = "#000000"; // default to black
  private highContrastLevels: number = 2; // default to 2 levels (black and white)
  private colorEquivalents: string[] = [];

  public constructor(settings: SettingsService) {
    this.settingsSerivice = settings;
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
  }

  private fakeGetSelectors(): string[] {
    // fake selectors for now, until we have real ones
    // we're just going to steal them directly from the svg in DOM

    // it'll either be called data-maidr or maidr-data
    const svg = document.querySelector("svg:first-child");
    let maidrDataString = "{}";
    if (!svg) return [];
    if (svg.hasAttribute("data-maidr")) {
      maidrDataString = svg.getAttribute("data-maidr") || "{}";
    } else if (svg.hasAttribute("maidr-data")) {
      maidrDataString = svg.getAttribute("maidr-data") || "{}";
    }
    const data = JSON.parse(maidrDataString);
    const selectors: string[] = [];

    function traverse(obj: unknown): void {
      if (obj === null || typeof obj !== "object") return;

      if (Array.isArray(obj)) {
        for (const item of obj) {
          traverse(item);
        }
      } else {
        for (const [key, value] of Object.entries(obj)) {
          if (key === "selectors") {
            if (typeof value === "string") {
              selectors.push(value);
            } else if (Array.isArray(value)) {
              selectors.push(
                ...value.filter((s): s is string => typeof s === "string"),
              );
            } else {
              selectors.push(...(Object.values(value) as string[]));
            }
          } else {
            traverse(value);
          }
        }
      }
    }

    traverse(data);

    return selectors;
  }

  private isThisElementInSelectors(
    element: Element,
    selectors: string[],
  ): boolean {
    // Implement logic to check if the element matches any of the selectors
    return selectors.some((selector) => element.matches(selector));
  }

  private updateContrastDisplay(
    context: Context,
    displayService: DisplayService,
  ): void {
    // todo, use 008A00 as default highlight color during high contrast mode
    // future todo: for 2 tone, use opposite color for highlight
    // if more than 2, use the furthest away

    const svg = displayService.plot;

    const selectors = this.fakeGetSelectors();

    if (!svg) return;

    const svgElements = svg.querySelectorAll("*");

    if (!this.highContrastMode) {
      // turn off high contrast mode, restore original colors

      document.body.style.backgroundColor = this.defaultBackgroundColor;
      document.body.style.color = this.defaultForegroundColor;

      svg.removeAttribute("style");
      svgElements.forEach((el) => {
        // Restore fill/stroke from style attribute
        const originalFill = el.getAttribute("data-original-fill");
        const originalStroke = el.getAttribute("data-original-stroke");
        const style = el.getAttribute("style") || "";

        let newStyle = style;
        if (originalFill) {
          newStyle = newStyle.replace(/fill:[^;]+/i, `fill:${originalFill}`);
          el.removeAttribute("data-original-fill");
        }
        if (originalStroke) {
          newStyle = newStyle.replace(
            /stroke:[^;]+/i,
            `stroke:${originalStroke}`,
          );
          el.removeAttribute("data-original-stroke");
        }
        if (newStyle !== style) el.setAttribute("style", newStyle);

        // Restore fill/stroke attributes
        const attrFill = el.getAttribute("data-attr-fill");
        const attrStroke = el.getAttribute("data-attr-stroke");

        if (attrFill) {
          el.setAttribute("fill", attrFill);
          el.removeAttribute("data-attr-fill");
        }

        if (attrStroke) {
          el.setAttribute("stroke", attrStroke);
          el.removeAttribute("data-attr-stroke");
        }

        // Remove text shadow filter
        if (el.getAttribute("filter") === "url(#glow-shadow)") {
          el.removeAttribute("filter");
        }

        // exceptions
        // line
        if ("type" in context.instructionContext) {
          if (context.instructionContext.type === "line") {
            document
              .getElementById(context.id)
              ?.classList.remove("high-contrast");
          }
        }
      });
    } else {
      // turn on high contrast mode

      // anything that's a selector: find the closest color in our set but reverse it.
      // That includes background and color, which get reverse by default
      // anything else: find the closest color but don't reverse it

      const bodyStyle = window.getComputedStyle(document.body);
      this.defaultBackgroundColor = bodyStyle.backgroundColor;
      this.defaultForegroundColor = bodyStyle.color;
      document.body.style.backgroundColor = this.highContrastDarkColor;
      document.body.style.color = this.highContrastLightColor;

      // add text shadow filter, if it doesn't exist
      this.addGlowShadowFilter(svg);

      // The broad plan is to replace all colors with their closest high contrast equivalent
      // there are exceptions, like text above, and near white for some charts

      // apply high contrast colors
      svgElements.forEach((el) => {
        // is this element in our selectors?
        const isInSelectors = this.isThisElementInSelectors(el, selectors);

        // Handle style fill/stroke
        const style = el.getAttribute("style") || "";
        const fillMatch = style.match(/fill:\s*([^;]+)/i);
        const strokeMatch = style.match(/stroke:\s*([^;]+)/i);

        let newStyle = style;
        // apply high contrast colors to each type, saving original in data- attributes

        // exceptions: we don't want these to be the same as background color
        const complexPath = el.getAttribute("d");
        let isComplexPath = false;
        if (complexPath) {
          isComplexPath = complexPath.length > 120;
        }
        const cantBeBackground = isComplexPath; // more exceptions can be added here

        if (fillMatch) {
          const originalFill = fillMatch[1];
          el.setAttribute("data-original-fill", originalFill);

          // set text fill to light color always
          let newFill;
          if (this.hasParentWithStringInID(el, "text")) {
            newFill = this.highContrastLightColor;
          } else {
            newFill = this.toColorStep(
              originalFill,
              context,
              isInSelectors,
              cantBeBackground,
            );
          }
          newStyle = newStyle.replace(/fill:[^;]+/i, `fill:${newFill}`);
        }

        if (strokeMatch) {
          const originalStroke = strokeMatch[1];
          el.setAttribute("data-original-stroke", originalStroke);

          let newStroke;
          if (this.hasParentWithStringInID(el, "text")) {
            newStroke = this.highContrastLightColor;
          } else {
            newStroke = this.toColorStep(
              originalStroke,
              context,
              isInSelectors,
              cantBeBackground,
            );
          }
          newStyle = newStyle.replace(/stroke:[^;]+/i, `stroke:${newStroke}`);
        }

        if (newStyle !== style) el.setAttribute("style", newStyle);

        // Handle fill/stroke attributes
        const attrFill = el.getAttribute("fill");
        if (attrFill) {
          el.setAttribute("data-attr-fill", attrFill);

          // set text fill to light color always
          let newFill;
          if (this.hasParentWithStringInID(el, "text")) {
            newFill = this.highContrastLightColor;
          } else {
            newFill = this.toColorStep(
              attrFill,
              context,
              isInSelectors,
              cantBeBackground,
            );
          }
          newStyle = newStyle.replace(/fill:[^;]+/i, `fill:${newFill}`);
        }

        const attrStroke = el.getAttribute("stroke");
        if (attrStroke) {
          el.setAttribute("data-attr-stroke", attrStroke);

          // set text stroke to light color always
          let newStroke;
          if (this.hasParentWithStringInID(el, "text")) {
            newStroke = this.highContrastLightColor;
          } else {
            const newStroke = this.toColorStep(
              attrStroke,
              context,
              isInSelectors,
              cantBeBackground,
            );
          }
          newStyle = newStyle.replace(/stroke:[^;]+/i, `stroke:${newStroke}`);
        }

        // text elements need a shadow
        if (this.hasParentWithStringInID(el, "text")) {
          el.setAttribute("filter", "url(#glow-shadow)");
        }
        if ("type" in context.instructionContext) {
          if (context.instructionContext.type === "line") {
            document.getElementById(context.id)?.classList.add("high-contrast");
          }
        }
      });

      // exceptions

      // text stuff, like axis labels, titles, etc
      displayService.plot.setAttribute(
        "style",
        "fill:" + this.highContrastLightColor,
      );

      // bookmark:
      // all color work done, everything looking good EXCEPT:
      // stacked or otherwise multi color bar charts all lock to either same color or background
      // group question: can we force a border in ggplot?
      // more immedietly:
      // proper selectors
      // announcement
      // hexa
    }
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
    
    <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur3"/>
    <feOffset dx="0" dy="0" result="offsetblur3" in="blur3"/>
    <feFlood flood-color="black" result="color3"/>
    <feComposite in="color3" in2="offsetblur3" operator="in" result="shadow3"/>
    
    <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur4"/>
    <feOffset dx="0" dy="0" result="offsetblur4" in="blur4"/>
    <feFlood flood-color="black" result="color4"/>
    <feComposite in="color4" in2="offsetblur4" operator="in" result="shadow4"/>
    
    <feMerge>
      <feMergeNode in="shadow3"/>
      <feMergeNode in="shadow4"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  `;

    filter.innerHTML = filterHTML;
    defs.appendChild(filter);
  }

  private toColorStep(
    value: string,
    context: Context,
    isInSelectors: boolean = false,
    cantBeBackground: boolean = false,
  ): string {
    // we redo the color using the number of levels supplied,
    // and user chosen light and dark colors,
    // and return a new color
    // we pick the closest color match

    // exception: if the incoming color is close to white,
    // (for bar, stacked bar, dodged bar, segmented bar charts)
    // we return the lightest color and spread the rest accordingly

    // exception: sometimes we don't want the color to be the same as background,
    // so we reduce the array of possible colors by 1

    // back out if the value is not a valid color
    if (value === "none" || value === "transparent") {
      return value;
    }

    // make a copy so we can manipulate it
    let colorEquivalents = [...this.colorEquivalents];

    // converting chart hex color to rgb
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return value;
    ctx.fillStyle = "#000"; // placeholder to init
    ctx.fillStyle = value.trim();
    const hex = ctx.fillStyle;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return value;

    // do we use near white strat? check luminance and chart type
    let useNearWhite = false; // don't need for most chart types, default to false
    const nearWhiteScale = 0.1; // 10% of white, = 90% white
    // If the color is close to white, return white
    if ("type" in context.instructionContext) {
      if (context.instructionContext.type === "bar") {
        if (isInSelectors) {
          useNearWhite = true;
        }
      }
    }

    // get color equivalents, interpolated from user chosen light/dark colors and number of levels
    // if we're using near white strat, we adjust the light color to be near white

    // get closest color from equivalents
    const outputColorHex = this.findClosestColor(
      value,
      colorEquivalents,
      useNearWhite,
      nearWhiteScale,
      isInSelectors,
      cantBeBackground,
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
