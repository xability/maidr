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

  private updateContrastDisplay(
    context: Context,
    displayService: DisplayService,
  ): void {
    // todo, use 008A00 as default highlight color during high contrast mode

    const svg = displayService.plot;

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

      const bodyStyle = window.getComputedStyle(document.body);
      this.defaultBackgroundColor = bodyStyle.backgroundColor;
      this.defaultForegroundColor = bodyStyle.color;
      document.body.style.backgroundColor = this.highContrastDarkColor;
      document.body.style.color = this.highContrastLightColor;

      // add text shadow filter, if it doesn't exist
      this.addGlowShadowFilter(svg);

      // text stuff, like axis labels, titles, etc
      displayService.plot.setAttribute(
        "style",
        "fill:" + this.highContrastDarkColor,
      );

      svgElements.forEach((el) => {
        // Handle style fill/stroke
        const style = el.getAttribute("style") || "";
        const fillMatch = style.match(/fill:\s*([^;]+)/i);
        const strokeMatch = style.match(/stroke:\s*([^;]+)/i);

        let newStyle = style;

        // is the element path complex? if so, it'll have more than 4 points and
        // will have a string length of more than 110 characters
        // we'll use this for an exception later
        const isComplexPath =
          el.tagName === "path" && (el.getAttribute("d")?.length || 0) > 110;

        if (fillMatch) {
          const originalFill = fillMatch[1];
          el.setAttribute("data-original-fill", originalFill);

          // skip text elements, do white text with text shadow black
          if (this.hasParentWithTextId(el)) {
            newStyle = newStyle.replace(
              /fill:[^;]+/i,
              `fill:${this.highContrastLightColor}`,
            );

            // add an attribute 'filter' for black shadow to the element
            el.setAttribute("filter", "url(#glow-shadow)");
          } else {
            const newFill = this.toColorStep(
              originalFill,
              this.highContrastLevels,
              context,
              isComplexPath,
            );
            newStyle = newStyle.replace(/fill:[^;]+/i, `fill:${newFill}`);
          }
        }

        if (strokeMatch) {
          const originalStroke = strokeMatch[1];
          el.setAttribute("data-original-stroke", originalStroke);

          // skip text elements, do white text with text shadow black
          if (this.hasParentWithTextId(el)) {
            newStyle = newStyle.replace(
              /stroke:[^;]+/i,
              `stroke:${this.highContrastLightColor}`,
            );

            // add an attribute 'filter' for black shadow to the element
            el.setAttribute("filter", "url(#glow-shadow)");
          } else {
            const newStroke = this.toColorStep(
              originalStroke,
              this.highContrastLevels,
              context,
              isComplexPath,
            );
            newStyle = newStyle.replace(/stroke:[^;]+/i, `stroke:${newStroke}`);
          }
        }

        if (newStyle !== style) el.setAttribute("style", newStyle);

        // Handle fill/stroke attributes
        const attrFill = el.getAttribute("fill");
        if (attrFill) {
          el.setAttribute("data-attr-fill", attrFill);

          // skip text elements, do white text with text shadow black
          if (this.hasParentWithTextId(el)) {
            el.setAttribute("fill", this.highContrastLightColor);

            // add an attribute 'filter' for black shadow to the element
            el.setAttribute("filter", "url(#glow-shadow)");
          } else {
            el.setAttribute(
              "fill",
              this.toColorStep(
                attrFill,
                this.highContrastLevels,
                context,
                isComplexPath,
              ),
            );
          }
        }

        const attrStroke = el.getAttribute("stroke");
        if (attrStroke) {
          el.setAttribute("data-attr-stroke", attrStroke);

          // skip text elements, do white text with text shadow black
          if (this.hasParentWithTextId(el)) {
            el.setAttribute("stroke", this.highContrastLightColor);

            // add an attribute 'filter' for black shadow to the element
            el.setAttribute("filter", "url(#glow-shadow)");
          } else {
            el.setAttribute(
              "stroke",
              this.toColorStep(
                attrStroke,
                this.highContrastLevels,
                context,
                isComplexPath,
              ),
            );
          }
        }
        if ("type" in context.instructionContext) {
          if (context.instructionContext.type === "line") {
            document.getElementById(context.id)?.classList.add("high-contrast");
          }
        }
      });
    }
  }

  /**
   * Checks if any parent element has an ID starting with 'text',
   * traversing up the DOM tree until reaching an SVG or BODY element.
   */
  private hasParentWithTextId(el: Element): boolean {
    let current = el.parentElement;

    while (current) {
      // Stop if we reach SVG or BODY
      if (current.tagName === "svg" || current.tagName === "BODY") {
        break;
      }

      // Check if current element's ID starts with 'text'
      if (current.id && current.id.startsWith("text")) {
        return true;
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

  private toColorStep(
    value: string,
    numLevels: number,
    context: Context,
    isComplexPath: boolean,
  ): string {
    // we redo the color using the number of levels supplied, returning a new color
    // So, numLevels = 2 means black and white, numLevels = 255 means full grayscale.
    // Inbetween we choose the closest color to the hue value.
    // We also do 'close to white' so we differentiate between white and near white
    // as sometimes (ie bar) the main bar color is super close to white but we don't want it the same
    // as the background color.

    // todo:
    // need to still use the full range,
    // so, take in all colors and adjust to the max range.
    // we need the selector to be able to do this

    // reverse raw white and black? typically yes but we'll see
    const flipWhiteBlack = true;

    // back out if the value is not a valid color
    if (value === "none" || value === "transparent") {
      return value;
    } else if (numLevels < 2 || numLevels > 255) {
      return value;
    }

    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return value;

    ctx.fillStyle = "#000";
    ctx.fillStyle = value.trim();
    const hex = ctx.fillStyle;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return value;

    // convert to grayscale
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    let useNearWhite = false; // don't need for most chart types
    const nearWhiteScale = 0.1; // 10% of white, so 90% white is near white
    const nearWhite = 255 * nearWhiteScale;
    // If the color is close to white, return white
    if ("type" in context.instructionContext) {
      if (
        (context.instructionContext.type === "bar" ||
          context.instructionContext.type === "stacked_bar" ||
          context.instructionContext.type === "dodged_bar" ||
          context.instructionContext.type === "segmented_bar") &&
        luminance >= nearWhite
      ) {
        // debugger;
        useNearWhite = true;
      }
    }

    const white = 255;
    const black = 0;

    const levels = [];
    // always start with black
    levels[0] = black;
    if (useNearWhite) {
      // when the near white strat is used, we reserve the top level for white and adjust the rest evenly
      const effectiveLevels = numLevels - 2;
      const step = (white - nearWhite - black) / effectiveLevels;
      // fill intermediate levels based on adjusted step
      for (let i = 1; i < effectiveLevels; i++) {
        levels.push(Math.round(i * step));
      }
      levels.push(white - nearWhite);
    } else {
      // if not using near white, we fill the levels evenly from black to white
      const effectiveLevels = numLevels - 1;
      const step = (white - black) / effectiveLevels;
      for (let i = 1; i < effectiveLevels; i++) {
        levels.push(Math.round(i * step));
      }
    }
    // always end with white (numLevels has to be at least 2)
    levels.push(white);

    // find closest
    let outputGray = levels[0];
    for (const level of levels) {
      if (Math.abs(luminance - level) < Math.abs(luminance - outputGray)) {
        outputGray = level;
      }
    }

    // exception: certain elements cannot be the same as background, or levels[levels.length - 1], override to one before that
    if (isComplexPath && outputGray === levels[levels.length - 1]) {
      outputGray = levels[levels.length - 2];
    }

    // flip white and black, as we want black background by default
    if (flipWhiteBlack) {
      if (outputGray === white) {
        outputGray = black;
      } else if (outputGray === black) {
        outputGray = white;
      }
    }

    const outputHex = outputGray.toString(16).padStart(2, "0");
    return `#${outputHex}${outputHex}${outputHex}`;
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
