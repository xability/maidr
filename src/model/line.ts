import type { ExtremaTarget } from '@type/extrema';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { MovableDirection, Node } from '@type/movable';
import type { XValue } from '@type/navigation';
import type { AudioState, BrailleState, TextState, TraceState } from '@type/state';
import type { Dimension } from './abstract';
import { Constant } from '@util/constant';
import { MathUtil } from '@util/math';
import { Svg } from '@util/svg';
import { AbstractTrace } from './abstract';
import { MovableGraph } from './movable';

const TYPE = 'Group';
/**
 * Regex for extracting data point coordinates from SVG path `d` attribute.
 *
 * Matches M/L commands (direct endpoints) with comma or whitespace separators,
 * and C (cubic bezier) commands — extracting the endpoint (last coordinate pair).
 *
 * M/L: `M65,231.42` or `L 100 200` → captures (65, 231.42) or (100, 200)
 * C:   `C81,215,97,199,113,182`    → captures endpoint (113, 182)
 */
const SVG_PATH_ML_REGEX
  = /[ML]\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/g;
const SVG_PATH_C_REGEX
  = /C\s*(?:-?\d+(?:\.\d+)?[,\s]+-?\d+(?:\.\d+)?[,\s]+){2}(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/g;

/**
 * Represents a line trace plot with support for single and multi-line navigation
 */
export class LineTrace extends AbstractTrace {
  protected get values(): number[][] {
    return this.lineValues;
  }

  protected readonly supportsExtrema = true;
  protected readonly rotorSupport = true;
  protected readonly movable;

  protected readonly points: LinePoint[][];
  protected readonly lineValues: number[][];
  protected readonly highlightValues: SVGElement[][] | null;
  protected highlightCenters:
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null;

  protected readonly min: number[];
  protected readonly max: number[];

  // Track previous row for intersection label ordering
  private previousRow: number | null = null;

  // Cache for intersection results, keyed by row index
  // Invalidated when active row changes
  private intersectionCache: Map<number, Array<{
    pointIndex: number;
    x: number;
    y: number;
    intersectingLines: number[];
    intersectionKind: 'point' | 'slope';
  }>> = new Map();

  public constructor(layer: MaidrLayer) {
    super(layer);

    this.points = layer.data as LinePoint[][];

    this.lineValues = this.points.map(row =>
      row.map(point => Number(point.y)),
    );
    this.min = this.lineValues.map(row => MathUtil.safeMin(row));
    this.max = this.lineValues.map(row => MathUtil.safeMax(row));

    this.highlightValues = this.mapToSvgElements(layer.selectors as string[]);
    this.highlightCenters = this.mapSvgElementsToCenters();
    this.movable = new MovableGraph(this.buildGraph());
  }

  public dispose(): void {
    this.points.length = 0;

    this.min.length = 0;
    this.max.length = 0;

    super.dispose();
  }

  private buildGraph(): (Node | null)[][] {
    const rowCount = this.points.length;
    if (rowCount === 0) {
      return new Array<Array<Node | null>>();
    }

    const maxCols = Math.max(0, ...this.points.map(row => row.length));
    const graph: (Node | null)[][] = this.points.map(row =>
      row.map(() => ({ up: null, down: null, left: null, right: null, top: null, bottom: null, start: null, end: null })),
    );

    for (let c = 0; c < maxCols; c++) {
      const pointsAtCol = this.points
        .map((row, idx) => ({ y: row[c]?.y, row: idx }))
        .filter(p => p.y !== undefined);
      if (pointsAtCol.length === 0) {
        continue;
      }

      const sortedPoints = [...pointsAtCol].sort((a, b) => a.y - b.y);
      const bottom = { row: sortedPoints[0].row, col: c };
      const top = { row: sortedPoints[sortedPoints.length - 1].row, col: c };
      for (let i = 0; i < sortedPoints.length; i++) {
        const { row } = sortedPoints[i];
        const node = graph[row][c];
        if (!node) {
          continue;
        }

        i > 0 && (node.down = { row: sortedPoints[i - 1].row, col: c });
        i < sortedPoints.length - 1 && (node.up = { row: sortedPoints[i + 1].row, col: c });
        node.bottom = bottom;
        node.top = top;
      }
    }

    for (let r = 0; r < rowCount; r++) {
      const start = this.points[r].length > 0 ? { row: r, col: 0 } : null;
      const end = this.points[r].length > 0
        ? { row: r, col: this.points[r].length - 1 }
        : null;

      for (let c = 0; c < this.points[r].length; c++) {
        const node = graph[r][c];
        if (!node) {
          continue;
        }

        c > 0 && (node.left = { row: r, col: c - 1 });
        c < this.points[r].length - 1 && (node.right = { row: r, col: c + 1 });
        node.start = start;
        node.end = end;
      }
    }

    return graph;
  }

  protected get audio(): AudioState {
    return {
      freq: {
        min: this.min[this.row],
        max: this.max[this.row],
        raw: this.lineValues[this.row][this.col],
      },
      panning: {
        x: this.col,
        y: this.row,
        rows: this.lineValues.length,
        cols: this.lineValues[this.row].length,
      },
      group: this.row,
    };
  }

  protected get braille(): BrailleState {
    return {
      empty: false,
      id: this.id,
      values: this.lineValues,
      min: this.min,
      max: this.max,
      row: this.row,
      col: this.col,
    };
  }

  protected get text(): TextState {
    const point = this.points[this.row][this.col];

    // Check for intersections at current point
    const intersections = this.findIntersections();
    let zData:
      | { z: { label: string; value: string } }
      | Record<string, never> = {};

    if (intersections.length > 1) {
      // Multiple lines intersect - create intersection text
      let lineTypes = intersections.map((intersection) => {
        const lineIndex = intersection.group!;
        return this.points[lineIndex][0]?.z || `l${lineIndex + 1}`;
      });

      // If previousRow is in the intersection, put its label first
      if (this.previousRow !== null) {
        const prevZ
          = this.points[this.previousRow][0]?.z || `l${this.previousRow + 1}`;
        if (lineTypes.includes(prevZ)) {
          lineTypes = [prevZ, ...lineTypes.filter(l => l !== prevZ)];
        }
      }

      zData = {
        z: {
          label: TYPE,
          value: `intersection at (${lineTypes.join(', ')})`,
        },
      };
    } else {
      // Single line or no intersection - use normal z data
      zData = point.z ? { z: { label: TYPE, value: point.z } } : {};
    }

    return {
      main: { label: this.xAxis, value: this.points[this.row][this.col].x },
      cross: { label: this.yAxis, value: this.points[this.row][this.col].y },
      ...zData,
    };
  }

  protected get dimension(): Dimension {
    return {
      rows: this.lineValues.length,
      cols: this.lineValues[this.row].length,
    };
  }

  public moveOnce(direction: MovableDirection): boolean {
    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
      this.previousRow = null;
      this.notifyStateUpdate();
      return true;
    }

    if (!this.isMovable(direction)) {
      this.notifyOutOfBounds();
      return false;
    }

    // Store previous row before moving
    this.previousRow = this.row;

    // Enhanced navigation for UPWARD/DOWNWARD - consider y values at current x position
    if (direction === 'UPWARD' || direction === 'DOWNWARD') {
      const targetRow = this.findLineByXAndYDirection(direction);
      const currentX = this.points[this.row][this.col].x;

      if (targetRow !== null && targetRow !== this.row) {
        // Find the column in the target line that has the same X value
        const targetCol = this.findColumnByXValue(targetRow, currentX);

        if (targetCol !== -1) {
          this.row = targetRow;
          this.col = targetCol;

          // Check for intersections and emit appropriate state
          const intersections = this.findIntersections();
          if (intersections.length > 1) {
            const baseState = super.state;
            const stateWithIntersections = {
              ...baseState,
              intersections,
            } as TraceState;
            for (const observer of this.observers) {
              observer.update(stateWithIntersections);
            }
          } else {
            this.notifyStateUpdate();
          }
          return true;
        } else {
          // No matching X value found in target line
          this.notifyOutOfBounds();
          return false;
        }
      } else {
        // No valid line found based on y values - hit boundary
        this.notifyOutOfBounds();
        return false;
      }
    }

    // Default navigation for FORWARD/BACKWARD only
    switch (direction) {
      case 'FORWARD':
        this.col += 1;
        break;
      case 'BACKWARD':
        this.col -= 1;
        break;
    }

    // Check for intersections and emit appropriate state
    const intersections = this.findIntersections();
    if (intersections.length > 1) {
      const baseState = super.state;
      const stateWithIntersections = {
        ...baseState,
        intersections,
      } as TraceState;
      for (const observer of this.observers) {
        observer.update(stateWithIntersections);
      }
    } else {
      this.notifyStateUpdate();
    }
    return true;
  }

  /**
   * Helper function to find all lines that intersect at the current (x, y) position
   * @returns Array of AudioState for all intersecting lines
   */
  private findIntersections(): AudioState[] {
    const currentX = this.points[this.row][this.col].x;
    const currentY = this.points[this.row][this.col].y;
    const intersections: AudioState[] = [];

    for (let r = 0; r < this.points.length; r++) {
      const c = this.points[r].findIndex(
        p => p.x === currentX && p.y === currentY,
      );
      if (c !== -1) {
        intersections.push(
          {
            freq: {
              min: this.min[r],
              max: this.max[r],
              raw: currentY,
            },
            panning: {
              x: this.col,
              y: this.row,
              rows: this.lineValues.length,
              cols: this.lineValues[this.row].length,
            },
            group: r,
          },
        );
      }
    }

    return intersections;
  }

  public isMovable(target: [number, number] | MovableDirection): boolean {
    if (Array.isArray(target)) {
      const [row, col] = target;
      return (
        row >= 0
        && row < this.values.length
        && col >= 0
        && col < this.values[row].length // Fixed: use target row instead of current row
      );
    }

    switch (target) {
      case 'UPWARD':
      case 'DOWNWARD': {
        // For y-value-based navigation, check if there's a valid target line with same X value
        const targetRow = this.findLineByXAndYDirection(target);
        if (targetRow === null) {
          return false;
        }
        // Also check if the target line has a point with the same X value
        const currentX = this.points[this.row][this.col].x;
        return this.findColumnByXValue(targetRow, currentX) !== -1;
      }
      case 'FORWARD':
        return this.col < this.values[this.row].length - 1;
      case 'BACKWARD':
        return this.col > 0;
    }
  }

  /**
   * Finds a line with the same X value but Y value in the desired direction
   * Uses strict equality (===) for X value matching
   * @param direction The direction to search (UPWARD for higher Y values, DOWNWARD for lower Y values)
   * @returns The row index of the target line, or null if no suitable line is found
   */
  private findLineByXAndYDirection(
    direction: 'UPWARD' | 'DOWNWARD',
  ): number | null {
    const currentX = this.points[this.row][this.col].x;

    let bestRow: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    // Check all lines for points with the same X value
    for (let row = 0; row < this.points.length; row++) {
      // Skip current row
      if (row === this.row) {
        continue;
      }

      // Find the point in this line with the EXACT same X value (strict equality)
      const matchingPointIndex = this.points[row].findIndex((point) => {
        const matches = point.x === currentX;
        return matches;
      });

      if (matchingPointIndex === -1) {
        // No point with this exact X value in this line - skip navigation to this line
        continue;
      }

      const lineY = this.points[row][matchingPointIndex].y;

      // Check if this line's y value is in the desired direction
      const isValidDirection
        = direction === 'UPWARD'
          ? lineY > this.points[this.row][this.col].y
          : lineY < this.points[this.row][this.col].y;
      const distance = Math.abs(lineY - this.points[this.row][this.col].y);

      if (!isValidDirection) {
        continue;
      }

      // Update best candidate if this is closer
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRow = row;
      }
    }

    return bestRow;
  }

  /**
   * Finds the column index for a given X value in a specific line
   * Uses strict equality (===) for X value matching
   * @param row The line index
   * @param xValue The X value to find
   * @returns The column index, or -1 if not found
   */
  private findColumnByXValue(row: number, xValue: number | string): number {
    return this.points[row].findIndex(point => point.x === xValue);
  }

  protected mapToSvgElements(selectors?: string[]): SVGElement[][] | null {
    if (!selectors || selectors.length !== this.lineValues.length) {
      return null;
    }

    // Try element-based approach first (e.g. Recharts individual dot circles).
    // If the selector matches multiple DOM elements whose count equals the
    // expected data points, use them directly — no path parsing needed.
    const elementBased = this.mapViaDomElements(selectors);
    if (elementBased) {
      return elementBased;
    }

    // Fall back to path-based approach: parse coordinates from a single
    // <path> or <polyline> element per series and create synthetic circles.
    return this.mapViaPathParsing(selectors);
  }

  /**
   * Element-based SVG mapping: select all matching elements per selector
   * and use them directly for highlighting (like BarTrace does).
   * Works when the charting library renders individual dot/circle elements.
   */
  private mapViaDomElements(selectors: string[]): SVGElement[][] | null {
    const svgElements: SVGElement[][] = [];
    let allFailed = true;

    for (let r = 0; r < selectors.length; r++) {
      const elements = Svg.selectAllElements(selectors[r]);
      if (elements.length === 0 || elements.length !== this.lineValues[r].length) {
        svgElements.push([]);
        continue;
      }
      allFailed = false;
      svgElements.push(elements);
    }

    return allFailed ? null : svgElements;
  }

  /**
   * Path-based SVG mapping: find a single <path> or <polyline> per selector,
   * parse data point coordinates from its attributes, and create synthetic
   * circle elements for highlighting.
   *
   * Supports M/L commands (linear paths) and C commands (cubic bezier curves).
   */
  private mapViaPathParsing(selectors: string[]): SVGElement[][] | null {
    const svgElements: SVGElement[][] = [];
    let allFailed = true;

    for (let r = 0; r < selectors.length; r++) {
      const lineElement = Svg.selectElement(selectors[r], false);
      if (!lineElement) {
        svgElements.push([]);
        continue;
      }

      const coordinates: LinePoint[] = [];
      if (lineElement instanceof SVGPathElement) {
        const pathD = lineElement.getAttribute(Constant.D) || Constant.EMPTY;
        this.extractPathCoordinates(pathD, coordinates);
      } else if (lineElement instanceof SVGPolylineElement) {
        const pointsAttr
          = lineElement.getAttribute(Constant.POINTS) || Constant.EMPTY;
        const strCoords = pointsAttr.split(/\s+/).filter(Boolean);
        for (const coordinate of strCoords) {
          const [x, y] = coordinate.split(Constant.COMMA);
          coordinates.push({
            x: Number.parseFloat(x),
            y: Number.parseFloat(y),
          });
        }
      }
      // Handle coordinate count mismatch.
      // SVG renderers (e.g. Plotly) may simplify paths by removing collinear
      // points.  When fewer coordinates than data points are found, interpolate
      // the missing positions along the simplified path segments so every data
      // point gets a highlight circle at the correct visual position.
      const expected = this.lineValues[r].length;
      if (coordinates.length !== expected) {
        if (coordinates.length >= 2 && coordinates.length < expected) {
          const pathXMin = Number(coordinates[0].x);
          const pathXMax = Number(coordinates[coordinates.length - 1].x);
          const dataPoints = this.points[r];
          const dataXMin = Number(dataPoints[0].x);
          const dataXMax = Number(dataPoints[dataPoints.length - 1].x);
          const dataXRange = dataXMax - dataXMin;

          const full: LinePoint[] = [];
          for (let i = 0; i < expected; i++) {
            const dataX = Number(dataPoints[i].x);
            const svgX = dataXRange > 0
              ? pathXMin + ((dataX - dataXMin) / dataXRange) * (pathXMax - pathXMin)
              : pathXMin;

            // Find y by interpolating along the simplified path segments
            let svgY = Number(coordinates[0].y);
            for (let j = 0; j < coordinates.length - 1; j++) {
              const cjx = Number(coordinates[j].x);
              const cj1x = Number(coordinates[j + 1].x);
              if (svgX >= cjx - 0.01 && svgX <= cj1x + 0.01) {
                const segLen = cj1x - cjx;
                const t = segLen > 0 ? (svgX - cjx) / segLen : 0;
                svgY = Number(coordinates[j].y) + t * (Number(coordinates[j + 1].y) - Number(coordinates[j].y));
                break;
              }
            }
            full.push({ x: svgX, y: svgY });
          }
          coordinates.length = 0;
          coordinates.push(...full);
        } else if (coordinates.length < expected) {
          while (coordinates.length < expected) {
            coordinates.push({ x: Number.NaN, y: Number.NaN });
          }
        } else {
          coordinates.length = expected;
        }
      }

      const linePointElements: SVGElement[] = [];
      let lineFailed = false;
      for (const coordinate of coordinates) {
        if (Number.isNaN(Number(coordinate.x)) || Number.isNaN(coordinate.y)) {
          lineFailed = true;
          break;
        }
        linePointElements.push(
          Svg.createCircleElement(coordinate.x, coordinate.y, lineElement),
        );
      }
      if (lineFailed) {
        svgElements.push([]);
        continue;
      }
      if (linePointElements.length > 0) {
        allFailed = false;
      }
      svgElements.push(linePointElements);
    }

    if (allFailed) {
      return null;
    }
    return svgElements;
  }

  /**
   * Extracts data point coordinates from an SVG path `d` attribute.
   * Handles M/L (move/line) and C (cubic bezier) commands.
   * For C commands, the endpoint (3rd coordinate pair) is extracted.
   */
  private extractPathCoordinates(pathD: string, coordinates: LinePoint[]): void {
    // Extract M/L endpoints
    SVG_PATH_ML_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null = SVG_PATH_ML_REGEX.exec(pathD);
    const indexed: { index: number; x: number; y: number }[] = [];
    while (match !== null) {
      indexed.push({
        index: match.index,
        x: Number.parseFloat(match[1]),
        y: Number.parseFloat(match[2]),
      });
      match = SVG_PATH_ML_REGEX.exec(pathD);
    }

    // Extract C cubic bezier endpoints (3rd pair of each C command)
    SVG_PATH_C_REGEX.lastIndex = 0;
    match = SVG_PATH_C_REGEX.exec(pathD);
    while (match !== null) {
      indexed.push({
        index: match.index,
        x: Number.parseFloat(match[1]),
        y: Number.parseFloat(match[2]),
      });
      match = SVG_PATH_C_REGEX.exec(pathD);
    }

    // Sort by position in path string to preserve point order
    indexed.sort((a, b) => a.index - b.index);
    for (const point of indexed) {
      coordinates.push({ x: point.x, y: point.y });
    }
  }

  public get state(): TraceState {
    const baseState = super.state;
    if (baseState.empty)
      return baseState;

    const isMultiline = this.points.length > 1;
    // Add the plotType field for non-empty states
    const stateWithPlotType = {
      ...baseState,
      plotType: isMultiline ? 'multiline' : 'single line',
      ...(isMultiline && { groupCount: this.points.length }),
    };

    // Check for intersection at current (x, y)
    const intersections = this.findIntersections();
    if (intersections.length > 1) {
      return { ...stateWithPlotType, intersections };
    }
    return stateWithPlotType;
  }

  protected mapSvgElementsToCenters():
    | { x: number; y: number; row: number; col: number; element: SVGElement }[]
    | null {
    const svgElements: (SVGElement | SVGElement[])[][] | null = this.highlightValues;

    if (!svgElements) {
      return null;
    }

    const centers: {
      x: number;
      y: number;
      row: number;
      col: number;
      element: SVGElement;
    }[] = [];
    for (let row = 0; row < svgElements.length; row++) {
      for (let col = 0; col < svgElements[row].length; col++) {
        const element = svgElements[row][col];
        const targetElement = Array.isArray(element) ? element[0] : element;
        if (targetElement) {
          const bbox = targetElement.getBoundingClientRect();
          centers.push({
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2,
            row,
            col,
            element: targetElement,
          });
        }
      }
    }

    return centers;
  }

  public findNearestPoint(
    x: number,
    y: number,
  ): { element: SVGElement; row: number; col: number } | null {
    // loop through highlightCenters to find nearest point
    if (!this.highlightCenters) {
      return null;
    }

    let nearestDistance = Infinity;
    let nearestIndex = -1;

    for (let i = 0; i < this.highlightCenters.length; i++) {
      const center = this.highlightCenters[i];
      const distance = Math.hypot(center.x - x, center.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    if (nearestIndex === -1) {
      return null;
    }

    return {
      element: this.highlightCenters[nearestIndex].element,
      row: this.highlightCenters[nearestIndex].row,
      col: this.highlightCenters[nearestIndex].col,
    };
  }

  /**
   * Check if two line segments intersect and return the intersection point
   * Uses parametric line intersection formula
   * @param p1 Start point of first segment
   * @param p1.x X coordinate of start point of first segment
   * @param p1.y Y coordinate of start point of first segment
   * @param p2 End point of first segment
   * @param p2.x X coordinate of end point of first segment
   * @param p2.y Y coordinate of end point of first segment
   * @param p3 Start point of second segment
   * @param p3.x X coordinate of start point of second segment
   * @param p3.y Y coordinate of start point of second segment
   * @param p4 End point of second segment
   * @param p4.x X coordinate of end point of second segment
   * @param p4.y Y coordinate of end point of second segment
   * @returns Intersection point {x, y} if segments intersect, null otherwise
   */
  private getSegmentIntersection(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    p4: { x: number; y: number },
  ): { x: number; y: number } | null {
    const x1 = p1.x;
    const y1 = p1.y;
    const x2 = p2.x;
    const y2 = p2.y;
    const x3 = p3.x;
    const y3 = p3.y;
    const x4 = p4.x;
    const y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // Lines are parallel (no intersection or infinite intersections)
    if (Math.abs(denom) < 1e-10) {
      return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // Check if intersection is within both segments (t and u must be in [0, 1])
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const intersectX = x1 + t * (x2 - x1);
      const intersectY = y1 + t * (y2 - y1);
      return { x: intersectX, y: intersectY };
    }

    return null;
  }

  /** Tolerance for comparing intersection coordinates (for deduplication) */
  private static readonly INTERSECTION_EPSILON = 1e-6;

  /**
   * Find all points where the current line intersects with other lines
   * Uses line segment intersection algorithm to find crossings between data points
   * Results are cached per row and invalidated when the active row changes
   * @returns Array of intersection info containing nearest point index and intersecting line indices
   */
  private findAllIntersectionsForCurrentLine(): Array<{
    pointIndex: number;
    x: number;
    y: number;
    intersectingLines: number[];
    intersectionKind: 'point' | 'slope';
  }> {
    const currentGroup = this.row;

    // Return cached results if available
    if (this.intersectionCache.has(currentGroup)) {
      return this.intersectionCache.get(currentGroup)!;
    }

    if (currentGroup < 0 || currentGroup >= this.points.length) {
      return [];
    }

    // Only check for intersections if there are multiple lines
    if (this.points.length <= 1) {
      return [];
    }

    const currentLinePoints = this.points[currentGroup];
    if (currentLinePoints.length < 2) {
      return [];
    }

    // Collect all raw intersections first
    const rawIntersections: Array<{
      pointIndex: number;
      x: number;
      y: number;
      otherLine: number;
    }> = [];

    // For each segment on the current line
    for (let segIndex = 0; segIndex < currentLinePoints.length - 1; segIndex++) {
      const p1 = currentLinePoints[segIndex];
      const p2 = currentLinePoints[segIndex + 1];

      // Convert to numeric for calculation
      const seg1Start = { x: Number(p1.x), y: Number(p1.y) };
      const seg1End = { x: Number(p2.x), y: Number(p2.y) };

      // Check against all segments from other lines
      for (let otherLine = 0; otherLine < this.points.length; otherLine++) {
        if (otherLine === currentGroup) {
          continue;
        }

        const otherLinePoints = this.points[otherLine];
        if (otherLinePoints.length < 2) {
          continue;
        }

        for (let otherSegIndex = 0; otherSegIndex < otherLinePoints.length - 1; otherSegIndex++) {
          const p3 = otherLinePoints[otherSegIndex];
          const p4 = otherLinePoints[otherSegIndex + 1];

          const seg2Start = { x: Number(p3.x), y: Number(p3.y) };
          const seg2End = { x: Number(p4.x), y: Number(p4.y) };

          const intersection = this.getSegmentIntersection(seg1Start, seg1End, seg2Start, seg2End);

          if (intersection) {
            // Find the nearest point on the current line to navigate to
            // Use Euclidean distance for accuracy with nearly vertical segments
            const distToStart = Math.hypot(intersection.x - seg1Start.x, intersection.y - seg1Start.y);
            const distToEnd = Math.hypot(intersection.x - seg1End.x, intersection.y - seg1End.y);
            const nearestPointIndex = distToStart <= distToEnd ? segIndex : segIndex + 1;

            rawIntersections.push({
              pointIndex: nearestPointIndex,
              x: intersection.x,
              y: intersection.y,
              otherLine,
            });
          }
        }
      }
    }

    // Group intersections using tolerance-based deduplication
    const groupedIntersections: Array<{
      pointIndex: number;
      x: number;
      y: number;
      intersectingLines: Set<number>;
    }> = [];

    for (const raw of rawIntersections) {
      // Find existing group within tolerance
      const existingGroup = groupedIntersections.find(
        g => Math.abs(g.x - raw.x) < LineTrace.INTERSECTION_EPSILON
          && Math.abs(g.y - raw.y) < LineTrace.INTERSECTION_EPSILON,
      );

      if (existingGroup) {
        existingGroup.intersectingLines.add(raw.otherLine);
      } else {
        const intersectingLines = new Set<number>();
        intersectingLines.add(raw.otherLine);
        groupedIntersections.push({
          pointIndex: raw.pointIndex,
          x: raw.x,
          y: raw.y,
          intersectingLines,
        });
      }
    }

    // Convert to final format and sort by x coordinate
    // Note: intersectingLines excludes currentGroup (only other lines)
    const result = groupedIntersections
      .map(entry => ({
        pointIndex: entry.pointIndex,
        x: entry.x,
        y: entry.y,
        intersectingLines: Array.from(entry.intersectingLines).sort((a, b) => a - b),
        // Classify once during target generation so UI can announce the right type.
        intersectionKind: this.classifyIntersectionKind(
          currentGroup,
          Array.from(entry.intersectingLines),
          entry.x,
          entry.y,
        ),
      }))
      .sort((a, b) => a.x - b.x);

    // Cache the result
    this.intersectionCache.set(currentGroup, result);

    return result;
  }

  /**
   * Get a formatted label for intersecting lines
   * Note: intersectingLines should only contain OTHER lines (not the current line)
   * since the user is already on the current line.
   * @param intersectingLines Array of line indices that intersect (excluding current line)
   * @returns Formatted string of line names (e.g., "Line A, Line B")
   */
  private getIntersectionLabel(intersectingLines: number[]): string {
    return intersectingLines.map((lineIndex) => {
      // Access first point to get the line's z/name
      // Falls back to "Line N" if z is not defined
      const firstPoint = this.points[lineIndex][0];
      return firstPoint?.z || `Line ${lineIndex + 1}`;
    }).join(', ');
  }

  /**
   * Check whether a line contains a sampled point at the given coordinate.
   * @param lineIndex The line index to inspect
   * @param x X coordinate
   * @param y Y coordinate
   * @returns True if the coordinate exists in the line's sampled points
   */
  private hasPointAtCoordinate(lineIndex: number, x: number, y: number): boolean {
    if (lineIndex < 0 || lineIndex >= this.points.length) {
      return false;
    }

    return this.points[lineIndex].some(point =>
      Math.abs(Number(point.x) - x) < LineTrace.INTERSECTION_EPSILON
      && Math.abs(Number(point.y) - y) < LineTrace.INTERSECTION_EPSILON,
    );
  }

  /**
   * Classify an intersection as either point-based (sampled in SVG data) or
   * slope-based (created by segment crossing between sampled points).
   * @param currentLine The current active line index
   * @param intersectingLines Other lines participating in this intersection
   * @param x Intersection x coordinate
   * @param y Intersection y coordinate
   * @returns Intersection kind
   */
  private classifyIntersectionKind(
    currentLine: number,
    intersectingLines: number[],
    x: number,
    y: number,
  ): 'point' | 'slope' {
    // Point intersection requires both lines to contain the sampled coordinate.
    const currentHasPoint = this.hasPointAtCoordinate(currentLine, x, y);
    if (!currentHasPoint) {
      return 'slope';
    }

    const otherHasPoint = intersectingLines.some(lineIndex =>
      this.hasPointAtCoordinate(lineIndex, x, y),
    );

    return otherHasPoint ? 'point' : 'slope';
  }

  /**
   * Get extrema targets for the current line plot
   * Returns min, max values, and intersection points within the current group
   * @returns Array of extrema targets for navigation
   */
  public override getExtremaTargets(): ExtremaTarget[] {
    const targets: ExtremaTarget[] = [];
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.lineValues.length) {
      return targets;
    }

    const groupValues = this.lineValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return targets;
    }
    // Use pre-computed min/max values instead of recalculating
    const groupMin = this.min[currentGroup];
    const groupMax = this.max[currentGroup];
    // Find indices of min/max values
    const maxIndices: number[] = [];
    const minIndices: number[] = [];
    for (let index = 0; index < groupValues.length; index++) {
      const value = groupValues[index];
      if (value === groupMax) {
        maxIndices.push(index);
      }
      if (value === groupMin) {
        minIndices.push(index);
      }
    }

    // Add max targets
    for (const maxIndex of maxIndices) {
      targets.push({
        label: `Max point at ${this.getPointLabel(maxIndex)}`,
        value: groupMax,
        pointIndex: maxIndex,
        segment: 'line',
        type: 'max',
        navigationType: 'point',
        xValue: this.points[this.row]?.[maxIndex]?.x,
      });
    }

    // Add min target
    for (const minIndex of minIndices) {
      targets.push({
        label: `Min point at ${this.getPointLabel(minIndex)}`,
        value: groupMin,
        pointIndex: minIndex,
        segment: 'line',
        type: 'min',
        navigationType: 'point',
        xValue: this.points[this.row]?.[minIndex]?.x,
      });
    }

    // Add intersection targets for multiline plots
    const intersections = this.findAllIntersectionsForCurrentLine();
    for (const intersection of intersections) {
      // intersectingLines only contains OTHER lines (not current line)
      const otherLineNames = this.getIntersectionLabel(intersection.intersectingLines);
      // Format the intersection coordinates for display
      const coordsDisplay = `x=${intersection.x.toFixed(2)}, y=${intersection.y.toFixed(2)}`;
      const intersectionLabel = intersection.intersectionKind === 'point'
        ? 'Point intersection'
        : 'Slope intersection';

      targets.push({
        label: `${intersectionLabel} at ${coordsDisplay}`,
        value: intersection.y,
        pointIndex: intersection.pointIndex,
        segment: 'intersection',
        type: 'intersection',
        intersectionKind: intersection.intersectionKind,
        navigationType: 'point',
        intersectingLines: intersection.intersectingLines,
        display: {
          coords: coordsDisplay,
          otherLines: otherLineNames,
        },
      });
    }

    return targets;
  }

  /**
   * Navigate to a specific extrema target
   * @param target The extrema target to navigate to
   */
  public override navigateToExtrema(target: ExtremaTarget): void {
    // Update the current point index (column)
    this.col = target.pointIndex;

    // Use common finalization method
    this.finalizeExtremaNavigation();
  }

  /**
   * Get a clean label for a specific point
   * @param pointIndex The index of the point
   * @returns A clean label for the point
   */
  private getPointLabel(pointIndex: number): string {
    if (this.points[this.row] && this.points[this.row][pointIndex]) {
      const point = this.points[this.row][pointIndex];
      return `${point.x}`;
    }
    return `Point ${pointIndex}`;
  }

  /**
   * Update the visual position of the current point
   * This method should be called when navigation changes
   */
  protected updateVisualPointPosition(): void {
    // Ensure we're within bounds
    const { row: safeRow, col: safeCol } = this.getSafeIndices();
    this.row = safeRow;
    this.col = safeCol;
  }

  /**
   * Get available X values for navigation
   * @returns Array of X values
   */
  public getAvailableXValues(): XValue[] {
    return this.points[this.row].map(val => val.x);
  }

  /**
   * Move the line plot to the position that matches the given X value
   * @param xValue The X value to move to
   * @returns true if the position was found and set, false otherwise
   */
  public moveToXValue(xValue: XValue): boolean {
    // Handle initial entry properly
    if (this.isInitialEntry) {
      this.movable.handleInitialEntry();
    }
    return super.moveToXValue(xValue);
  }

  public moveToNextCompareValue(direction: string, type: 'lower' | 'higher'): boolean {
    const currentGroup = this.row;
    if (currentGroup < 0 || currentGroup >= this.lineValues.length) {
      return false;
    }

    const groupValues = this.lineValues[currentGroup];
    if (!groupValues || groupValues.length === 0) {
      return false;
    }

    const currentIndex = this.col;
    const step = direction === 'right' ? 1 : -1;
    let i = currentIndex + step;

    while (i >= 0 && i < groupValues.length) {
      if (this.compare(groupValues[i], groupValues[currentIndex], type)) {
        this.col = i;
        this.updateVisualPointPosition();
        this.notifyStateUpdate();
        return true;
      }
      i += step;
    }
    this.notifyRotorBounds();
    return false;
  }

  public compare(a: number, b: number, type: 'lower' | 'higher'): boolean {
    if (type === 'lower') {
      return a < b;
    }
    if (type === 'higher') {
      return a > b;
    }
    return false;
  }

  public moveUpRotor(_mode?: 'lower' | 'higher'): boolean {
    this.moveOnce('UPWARD');
    return true;
  }

  public moveDownRotor(_mode?: 'lower' | 'higher'): boolean {
    this.moveOnce('DOWNWARD');
    return true;
  }

  /**
   * Intersection navigation mode is available only when the plot has
   * multiple lines (i.e. crossings between sampled series are possible).
   */
  public override supportsIntersectionMode(): boolean {
    return this.points.length > 1;
  }

  /**
   * Collect point-type intersections for the current line, sorted by
   * pointIndex (column), with duplicate pointIndexes removed so that
   * navigation advances one data point at a time.
   */
  private getPointIntersectionIndices(): number[] {
    const intersections = this.findAllIntersectionsForCurrentLine();
    const seen = new Set<number>();
    const indices: number[] = [];
    for (const intersection of intersections) {
      if (intersection.intersectionKind !== 'point') {
        continue;
      }
      if (seen.has(intersection.pointIndex)) {
        continue;
      }
      seen.add(intersection.pointIndex);
      indices.push(intersection.pointIndex);
    }
    indices.sort((a, b) => a - b);
    return indices;
  }

  public override moveToNextIntersection(): boolean {
    const indices = this.getPointIntersectionIndices();
    const target = indices.find(index => index > this.col);
    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }
    this.col = target;
    this.finalizeExtremaNavigation();
    return true;
  }

  public override moveToPrevIntersection(): boolean {
    const indices = this.getPointIntersectionIndices();
    let target: number | undefined;
    for (let i = indices.length - 1; i >= 0; i--) {
      if (indices[i] < this.col) {
        target = indices[i];
        break;
      }
    }
    if (target === undefined) {
      this.notifyRotorBounds();
      return false;
    }
    this.col = target;
    this.finalizeExtremaNavigation();
    return true;
  }
}
