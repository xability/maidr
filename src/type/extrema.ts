/**
 * Interface for plots that support extrema navigation
 * Any plot implementing this interface can be used with the go-to extrema feature
 */
export interface ExtremaNavigable {
  /**
   * Get available extrema targets for the current navigation context
   * @returns Array of extrema targets that can be navigated to
   */
  getExtremaTargets: () => ExtremaTarget[];

  /**
   * Navigate to a specific extrema target
   * @param target The extrema target to navigate to
   */
  navigateToExtrema: (target: ExtremaTarget) => void;
}

/**
 * Represents a single extrema target that can be navigated to
 */
export interface ExtremaTarget {
  /** Human-readable label for the extrema (e.g., "Max Open", "Min Volatility") */
  label: string;

  /** The actual numeric value of the extrema */
  value: number;

  /**
   * What `[` and `]` rank the target by, when that is not `value`.
   *
   * `value` is the reading the Go To dialog shows. A parallel coordinates
   * observation crosses axes measured in different units, so its readings
   * are ranked by where each sits on its own axis, from 0 to 1, rather than
   * by which number is largest.
   *
   * A place is a quotient, so two readings drawn at one height on axes of
   * different extents can differ in the last bit. Rank values are therefore
   * tied when `MathUtil.nearlyEqual` says they are, by the trace that lists
   * the targets and by the service that walks them alike.
   */
  rankValue?: number;

  /** Index of the point to navigate to */
  pointIndex: number;

  /** Identifier for the segment/group this extrema belongs to */
  segment: string;

  /** Type of extrema - maximum, minimum, or intersection */
  type: 'max' | 'min' | 'intersection';

  /** Classification for intersection targets */
  intersectionKind?: 'point' | 'slope';

  /** Index of the group this extrema belongs to (for group-based plots) */
  groupIndex?: number;

  /** Index of the category within the group (for group-based plots) */
  categoryIndex?: number;

  /** Type of navigation this extrema requires */
  navigationType: 'point' | 'group';

  /** Raw x-axis value for formatting (e.g., timestamp before date conversion) */
  xValue?: number | string;

  /**
   * For intersection targets: indices of all lines that intersect at this point
   * Used for multiline plots to track which lines are involved in the intersection
   */
  intersectingLines?: number[];

  /**
   * The parts the Go To dialog composes its line from, so that no consumer
   * has to parse `label` — a sentence whose word order is the language's.
   */
  display?: {
    /** The extremum without its position, translated: "Max Bar", "Row Maximum" */
    name?: string;
    /**
     * The x value, or category, as `label` speaks it. The view model swaps in
     * the layer's formatted form when this is `xValue` written out.
     */
    x?: string;
    /** The row a grid cell is on, spoken after `x` */
    y?: string;
    /** Pre-formatted coordinates string (e.g., "x=1.5, y=2.5", or "x between A and B, y=2.5") */
    coords?: string;
    /** Names of other lines involved (for intersections, excludes current line) */
    otherLines?: string;
  };
}
