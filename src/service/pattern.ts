/**
 * PatternService - Manages SVG pattern fills for accessibility
 *
 * Provides reusable patterns for low vision users to differentiate
 * chart elements beyond color alone. Patterns are injected into SVG
 * <defs> sections and referenced via fill="url(#pattern-id)".
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Available pattern types for accessibility differentiation.
 * Each pattern is visually distinct to maximize differentiability.
 */
export type PatternType =
  | "diagonal-stripes"
  | "square-grid"
  | "dots"
  | "horizontal-lines"
  | "diamonds";

/**
 * Configuration for creating a pattern instance
 */
export interface PatternConfig {
  /** The pattern type to create */
  type: PatternType;
  /** Base/background color of the pattern */
  baseColor: string;
  /** Foreground/pattern element color */
  patternColor: string;
  /** Optional scale factor (default: 1) */
  scale?: number;
}

/**
 * Pattern definition containing the SVG pattern element and its ID
 */
interface PatternDefinition {
  id: string;
  element: SVGPatternElement;
}

/**
 * Internal pattern template generator function type
 */
type PatternGenerator = (
  baseColor: string,
  patternColor: string,
  scale: number,
) => SVGPatternElement;

export class PatternService {
  private static readonly PATTERN_PREFIX = "maidr-pattern";

  /** Cache of created patterns to avoid duplicates: patternKey -> patternId */
  private readonly patternCache: Map<string, string> = new Map();

  /** Reference to the SVG's defs element */
  private defsElement: SVGDefsElement | null = null;

  /** Reference to the target SVG */
  private targetSvg: SVGSVGElement | null = null;

  /** Pattern generators for each pattern type */
  private readonly patternGenerators: Record<PatternType, PatternGenerator> = {
    "diagonal-stripes": this.createDiagonalStripes.bind(this),
    "square-grid": this.createSquareGrid.bind(this),
    dots: this.createDots.bind(this),
    "horizontal-lines": this.createHorizontalLines.bind(this),
    diamonds: this.createDiamonds.bind(this),
  };

  /**
   * Initialize the pattern service with a target SVG element.
   * Ensures a <defs> element exists for pattern definitions.
   * @param svg The SVG element to inject patterns into
   */
  public initialize(svg: SVGSVGElement): void {
    this.targetSvg = svg;
    this.ensureDefsElement();
  }

  /**
   * Get or create a pattern with the specified configuration.
   * Returns the pattern ID to use in fill="url(#id)".
   * @param config Pattern configuration
   * @returns Pattern ID string for use in fill attribute
   */
  public getPattern(config: PatternConfig): string {
    const { type, baseColor, patternColor, scale = 1 } = config;

    // Generate cache key
    const cacheKey = this.generateCacheKey(
      type,
      baseColor,
      patternColor,
      scale,
    );

    // Return cached pattern if exists
    const cached = this.patternCache.get(cacheKey);
    if (cached && this.patternExists(cached)) {
      return cached;
    }

    // Create new pattern
    const pattern = this.createPattern(config);
    this.patternCache.set(cacheKey, pattern.id);

    // Inject into defs
    this.injectPattern(pattern);

    return pattern.id;
  }

  /**
   * Apply a pattern to an SVG element.
   * Handles both style attribute and fill attribute cases.
   * @param element The element to apply the pattern to
   * @param config Pattern configuration
   */
  public applyPattern(element: SVGElement, config: PatternConfig): void {
    const patternId = this.getPattern(config);
    const patternUrl = `url(#${patternId})`;

    // Check if fill is set via style attribute (higher specificity)
    const style = element.getAttribute("style") || "";
    if (style.match(/fill:\s*[^;]+/i)) {
      // Replace fill value in style attribute
      const newStyle = style.replace(/fill:\s*[^;]+/i, `fill:${patternUrl}`);
      element.setAttribute("style", newStyle);
    } else {
      // Set fill attribute directly
      element.setAttribute("fill", patternUrl);
    }
  }

  /**
   * Remove pattern from an element and restore original fill.
   * @param element The element to remove the pattern from
   * @param originalFill The original fill value to restore
   */
  public removePattern(element: SVGElement, originalFill: string): void {
    element.setAttribute("fill", originalFill);
  }

  /**
   * Get all available pattern types.
   * Useful for cycling through patterns for different data series.
   * Note: order determines assignment, eg the first series gets the first pattern and so on.
   */
  public getPatternTypes(): PatternType[] {
    return [
      "diagonal-stripes",
      "dots",
      "square-grid",
      "horizontal-lines",
      "diamonds",
    ];
  }

  /**
   * Get pattern type by index (wraps around if index > number of patterns).
   * Useful for assigning patterns to data series.
   * @param index Zero-based index
   */
  public getPatternTypeByIndex(index: number): PatternType {
    const types = this.getPatternTypes();
    return types[index % types.length];
  }

  /**
   * Clean up all patterns created by this service.
   */
  public dispose(): void {
    // Remove all cached patterns from the DOM
    for (const patternId of this.patternCache.values()) {
      const element = this.targetSvg?.querySelector(`#${patternId}`);
      element?.remove();
    }
    this.patternCache.clear();
    this.defsElement = null;
    this.targetSvg = null;
  }

  /**
   * Ensure a <defs> element exists in the target SVG.
   */
  private ensureDefsElement(): void {
    if (!this.targetSvg) {
      throw new Error("PatternService not initialized with target SVG");
    }

    let defs = this.targetSvg.querySelector("defs") as SVGDefsElement | null;
    if (!defs) {
      defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
      this.targetSvg.insertBefore(defs, this.targetSvg.firstChild);
    }
    this.defsElement = defs;
  }

  /**
   * Check if a pattern with the given ID exists in the DOM.
   */
  private patternExists(patternId: string): boolean {
    return !!this.targetSvg?.querySelector(`#${patternId}`);
  }

  /**
   * Generate a unique cache key for a pattern configuration.
   */
  private generateCacheKey(
    type: PatternType,
    baseColor: string,
    patternColor: string,
    scale: number,
  ): string {
    // Normalize colors to lowercase hex
    const normalizedBase = this.normalizeColor(baseColor);
    const normalizedPattern = this.normalizeColor(patternColor);
    return `${type}-${normalizedBase}-${normalizedPattern}-${scale}`;
  }

  /**
   * Generate a unique pattern ID.
   */
  private generatePatternId(type: PatternType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${PatternService.PATTERN_PREFIX}-${type}-${timestamp}-${random}`;
  }

  /**
   * Normalize a color value to a consistent format.
   */
  private normalizeColor(color: string): string {
    // Use canvas to normalize any CSS color to hex
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return color.toLowerCase().replace(/\s/g, "");

    ctx.fillStyle = "#000";
    ctx.fillStyle = color;
    return ctx.fillStyle.toLowerCase();
  }

  /**
   * Create a pattern definition from configuration.
   */
  private createPattern(config: PatternConfig): PatternDefinition {
    const { type, baseColor, patternColor, scale = 1 } = config;

    const generator = this.patternGenerators[type];
    if (!generator) {
      throw new Error(`Unknown pattern type: ${type}`);
    }

    const element = generator(baseColor, patternColor, scale);
    const id = this.generatePatternId(type);
    element.setAttribute("id", id);

    return { id, element };
  }

  /**
   * Inject a pattern into the SVG defs element.
   */
  private injectPattern(pattern: PatternDefinition): void {
    if (!this.defsElement) {
      this.ensureDefsElement();
    }
    this.defsElement?.appendChild(pattern.element);
  }

  // ============================================================
  // Pattern Generators
  // ============================================================

  /**
   * Pattern 1: Diagonal Stripes (45°)
   * Classic diagonal lines, high contrast, easily distinguishable.
   */
  private createDiagonalStripes(
    baseColor: string,
    patternColor: string,
    scale: number,
  ): SVGPatternElement {
    const size = 12 * scale;
    const strokeWidth = 5 * scale;

    const pattern = document.createElementNS(
      SVG_NS,
      "pattern",
    ) as SVGPatternElement;
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));
    pattern.setAttribute("patternTransform", "rotate(45)");

    // Background rect
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(size));
    rect.setAttribute("height", String(size));
    rect.setAttribute("fill", baseColor);
    pattern.appendChild(rect);

    // Diagonal line (vertical line that appears diagonal due to rotation)
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", "0");
    line.setAttribute("x2", "0");
    line.setAttribute("y2", String(size));
    line.setAttribute("stroke", patternColor);
    line.setAttribute("stroke-width", String(strokeWidth));
    pattern.appendChild(line);

    return pattern;
  }

  /**
   * Pattern 2: Square Grid / Crosshatch
   * Perpendicular lines forming a grid.
   */
  private createSquareGrid(
    baseColor: string,
    patternColor: string,
    scale: number,
  ): SVGPatternElement {
    const size = 14 * scale;
    const strokeWidth = 3 * scale;

    const pattern = document.createElementNS(
      SVG_NS,
      "pattern",
    ) as SVGPatternElement;
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));

    // Background rect
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(size));
    rect.setAttribute("height", String(size));
    rect.setAttribute("fill", baseColor);
    pattern.appendChild(rect);

    // Grid lines (L-shape that tiles to form grid)
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", `M ${size} 0 L 0 0 0 ${size}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", patternColor);
    path.setAttribute("stroke-width", String(strokeWidth));
    pattern.appendChild(path);

    return pattern;
  }

  /**
   * Pattern 3: Polka Dots
   * Evenly spaced circles, organic feel, highly recognizable.
   */
  private createDots(
    baseColor: string,
    patternColor: string,
    scale: number,
  ): SVGPatternElement {
    const size = 16 * scale;
    const radius = 4 * scale;

    const pattern = document.createElementNS(
      SVG_NS,
      "pattern",
    ) as SVGPatternElement;
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));

    // Background rect
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(size));
    rect.setAttribute("height", String(size));
    rect.setAttribute("fill", baseColor);
    pattern.appendChild(rect);

    // Center dot
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", String(size / 2));
    circle.setAttribute("cy", String(size / 2));
    circle.setAttribute("r", String(radius));
    circle.setAttribute("fill", patternColor);
    pattern.appendChild(circle);

    return pattern;
  }

  /**
   * Pattern 4: Horizontal Lines
   * Clean horizontal stripes, simple and bold.
   */
  private createHorizontalLines(
    baseColor: string,
    patternColor: string,
    scale: number,
  ): SVGPatternElement {
    const size = 10 * scale;
    const strokeWidth = 4 * scale;

    const pattern = document.createElementNS(
      SVG_NS,
      "pattern",
    ) as SVGPatternElement;
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));

    // Background rect
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(size));
    rect.setAttribute("height", String(size));
    rect.setAttribute("fill", baseColor);
    pattern.appendChild(rect);

    // Horizontal line
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", "0");
    line.setAttribute("y1", String(size / 2));
    line.setAttribute("x2", String(size));
    line.setAttribute("y2", String(size / 2));
    line.setAttribute("stroke", patternColor);
    line.setAttribute("stroke-width", String(strokeWidth));
    pattern.appendChild(line);

    return pattern;
  }

  /**
   * Pattern 5: Diamonds / Checkerboard
   * Rotated squares creating a diamond checkerboard pattern.
   */
  private createDiamonds(
    baseColor: string,
    patternColor: string,
    scale: number,
  ): SVGPatternElement {
    const size = 16 * scale;
    const halfSize = size / 2;

    const pattern = document.createElementNS(
      SVG_NS,
      "pattern",
    ) as SVGPatternElement;
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", String(size));
    pattern.setAttribute("height", String(size));
    pattern.setAttribute("patternTransform", "rotate(45)");

    // Background rect
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("width", String(size));
    rect.setAttribute("height", String(size));
    rect.setAttribute("fill", baseColor);
    pattern.appendChild(rect);

    // Two checkerboard squares
    const square1 = document.createElementNS(SVG_NS, "rect");
    square1.setAttribute("width", String(halfSize));
    square1.setAttribute("height", String(halfSize));
    square1.setAttribute("fill", patternColor);
    pattern.appendChild(square1);

    const square2 = document.createElementNS(SVG_NS, "rect");
    square2.setAttribute("x", String(halfSize));
    square2.setAttribute("y", String(halfSize));
    square2.setAttribute("width", String(halfSize));
    square2.setAttribute("height", String(halfSize));
    square2.setAttribute("fill", patternColor);
    pattern.appendChild(square2);

    return pattern;
  }
}
