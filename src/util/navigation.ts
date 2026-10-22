import type { Coordinate } from '@type/movable';
import type { PointWithX, ValuesArray, XValue } from '@type/navigation';
import { hasXProperty, isPointWithX, isXValue } from '@type/navigation';

/**
 * Coordinate helpers shared by every trace that navigates by X value.
 *
 * Pure functions over the data a trace already holds: no state, no side
 * effects, nothing to dispose. They used to be methods on a class under
 * `src/service/`, which put a service import in the model layer that
 * `.claude/rules/model.md` forbids and made every trace allocate an instance
 * to call them. Here `AbstractTrace` and `Candlestick` can call them directly.
 */

/**
 * Compute the point index and segment type a grid cell names.
 *
 * The cell is `[section][point]` in every orientation: the highlight grid,
 * the braille cell and the movable grid of a sectioned trace all share
 * that frame, and the orientation only says which screen axis the points
 * run along.
 * @param row The row coordinate from UI/ViewModel
 * @param col The column coordinate from UI/ViewModel
 * @param sections Array of available section names (e.g., ['open', 'high', 'low', 'close'])
 * @returns Object containing pointIndex and segmentType
 */
export function computeIndexAndSegment<T extends string>(
  row: number,
  col: number,
  sections: readonly T[],
): {
  pointIndex: number;
  segmentType: T;
} {
  return {
    pointIndex: col,
    segmentType: sections[row],
  };
}

/**
 * Extract X value from points array based on current position.
 * @param points - Array of points (single or multi-row)
 * @param row - The row index
 * @param col - The column index
 * @returns The extracted X value or null if not found
 */
export function extractXValueFromPoints(points: PointWithX[][] | PointWithX[], row: number, col: number): XValue | null {
  // Single-row traces (like BarTrace)
  if (Array.isArray(points) && points.length === 1 && Array.isArray(points[0])) {
    const point = points[0][col];
    return extractXFromPoint(point);
  }

  // Multi-row traces (like LineTrace)
  if (Array.isArray(points) && Array.isArray(points[row]) && points[row][col]) {
    const point = points[row][col];
    return extractXFromPoint(point);
  }

  return null;
}

/**
 * Extract X value from values array based on current position.
 * @param values - 2D array of values
 * @param row - The row index
 * @param col - The column index
 * @returns The extracted X value or null if not found
 */
export function extractXValueFromValues(values: ValuesArray, row: number, col: number): XValue | null {
  if (isValidPosition(values, row, col)) {
    const value = values[row][col];
    return extractXFromValue(value);
  }
  return null;
}

/**
 * Navigate to a specific X value within the points array and invoke callback with new position.
 *
 * An exact match on `preferredRow` wins over one on any other row. A layer
 * switch away and back calls this with the X the reader left at, and
 * resolving that to the first row holding it silently moved a reader on
 * line 3 to line 1: same X, different series, and every Up/Down from then
 * on started from the wrong one.
 * @param points - Array of points (single or multi-row)
 * @param xValue - The target X value to navigate to
 * @param moveToIndex - Callback function to execute when position is found
 * @param preferredRow - The row to try first, normally the trace's current row
 * @returns True if navigation was successful, false otherwise
 */
export function moveToXValueInPoints(
  points: PointWithX[][] | PointWithX[],
  xValue: XValue,
  moveToIndex: (row: number, col: number) => void,
  preferredRow = 0,
): boolean {
  // Single-row traces (like BarTrace)
  if (Array.isArray(points) && points.length === 1 && Array.isArray(points[0])) {
    const targetIndex = findPointIndexByX(points[0], xValue);
    if (targetIndex !== -1) {
      moveToIndex(0, targetIndex);
      return true;
    } else {
      // Fallback: find nearest or categorical X
      const nearestIndex = findNearestPointIndexByX(points[0], xValue);
      if (nearestIndex !== -1) {
        const _actualX = extractXValue(points[0][nearestIndex]);
        if (typeof xValue === 'number' && typeof _actualX === 'number') {
          moveToIndex(0, nearestIndex);
          return true;
        } else if (typeof xValue === 'string' && typeof _actualX === 'string') {
          moveToIndex(0, nearestIndex);
          return true;
        }
      }
    }
  }

  // Multi-row traces (like LineTrace): the row the cursor is on first, so an
  // X that several series share keeps the reader on their series.
  const preferredPoints = Array.isArray(points) ? points[preferredRow] : undefined;
  if (Array.isArray(preferredPoints)) {
    const colIndex = findPointIndexByX(preferredPoints, xValue);
    if (colIndex !== -1) {
      moveToIndex(preferredRow, colIndex);
      return true;
    }
  }

  let bestRow = -1;
  let bestCol = -1;
  let bestDist = Number.POSITIVE_INFINITY;

  if (Array.isArray(points)) {
    for (let row = 0; row < points.length; row++) {
      const rowPoints = points[row];
      if (Array.isArray(rowPoints)) {
        const colIndex = findPointIndexByX(rowPoints, xValue);
        if (colIndex !== -1) {
          moveToIndex(row, colIndex);
          return true;
        }
        // Fallback: find nearest/categorical in this row
        const nearestCol = findNearestPointIndexByX(rowPoints, xValue);
        if (nearestCol !== -1) {
          const actualX = extractXValue(rowPoints[nearestCol]);
          if (typeof xValue === 'number' && typeof actualX === 'number') {
            const dist = Math.abs(actualX - xValue);
            if (dist < bestDist) {
              bestDist = dist;
              bestRow = row;
              bestCol = nearestCol;
            }
          } else if (typeof xValue === 'string' && typeof actualX === 'string') {
            if (bestRow === -1) {
              bestRow = row;
              bestCol = nearestCol;
            }
          } else if (bestRow === -1) {
            bestRow = row;
            bestCol = nearestCol;
          }
        }
      }
    }
  }

  if (bestRow !== -1 && bestCol !== -1) {
    moveToIndex(bestRow, bestCol);
    return true;
  }

  return false;
}

/**
 * Navigate to a specific X value within the values array and invoke callback with new position.
 * @param values - 2D array of values
 * @param xValue - The target X value to navigate to
 * @param moveToIndex - Callback function to execute when position is found
 * @returns True if navigation was successful, false otherwise
 */
export function moveToXValueInValues(
  values: ValuesArray,
  xValue: XValue,
  moveToIndex: (row: number, col: number) => void,
): boolean {
  let bestRow = -1;
  let bestCol = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      const value = values[row][col];
      const valueToCompare = extractXFromValue(value);
      if (valueToCompare === xValue) {
        moveToIndex(row, col);
        return true;
      }
      // Fallback: find nearest/categorical
      if (typeof xValue === 'number' && typeof valueToCompare === 'number') {
        const dist = Math.abs(valueToCompare - xValue);
        if (dist < bestDist) {
          bestDist = dist;
          bestRow = row;
          bestCol = col;
        }
      } else if (typeof xValue === 'string' && typeof valueToCompare === 'string') {
        if (bestRow === -1) {
          bestRow = row;
          bestCol = col;
        }
      } else if (bestRow === -1) {
        bestRow = row;
        bestCol = col;
      }
    }
  }
  if (bestRow !== -1 && bestCol !== -1) {
    moveToIndex(bestRow, bestCol);
    return true;
  }
  return false;
}

/**
 * Extract X value from a point object using type guards.
 * @param point - The point object to extract from
 * @returns The X value or null if not found
 */
function extractXFromPoint(point: unknown): XValue | null {
  if (isPointWithX(point)) {
    return point.x;
  }
  return null;
}

/**
 * Extract X value from a generic value using type guards.
 * @param value - The value to extract from
 * @returns The X value or null if not found
 */
function extractXFromValue(value: unknown): XValue | null {
  if (hasXProperty(value)) {
    return value.x;
  }
  if (isXValue(value)) {
    return value;
  }
  return null;
}

/**
 * Find the index of a point with the specified X value.
 * @param points - Array of points to search
 * @param xValue - The X value to find
 * @returns The index of the matching point or -1 if not found
 */
function findPointIndexByX(points: PointWithX[], xValue: XValue): number {
  return points.findIndex(point => point.x === xValue);
}

/**
 * Validate that the specified position exists within the values array bounds.
 * @param values - 2D array of values
 * @param row - The row index to validate
 * @param col - The column index to validate
 * @returns True if position is valid, false otherwise
 */
function isValidPosition(values: ValuesArray, row: number, col: number): boolean {
  return row >= 0 && row < values.length
    && col >= 0 && col < values[row].length;
}

/**
 * Find the nearest point index by X value, handling both numeric and categorical data types.
 * @param points - Array of points to search
 * @param xValue - The target X value
 * @returns The index of the nearest point or -1 if not found
 */
function findNearestPointIndexByX(points: PointWithX[], xValue: XValue): number {
  if (typeof xValue === 'number') {
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i++) {
      const px = extractXValue(points[i]);
      if (typeof px === 'number') {
        const dist = Math.abs(px - xValue);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      } else if (typeof px === 'string') {
        const pxNum = Number(px);
        if (!Number.isNaN(pxNum)) {
          const dist = Math.abs(pxNum - xValue);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
      }
    }
    if (bestIdx !== -1) {
      return bestIdx;
    }
  } else if (typeof xValue === 'string') {
    for (let i = 0; i < points.length; i++) {
      const px = extractXValue(points[i]);
      if (px === xValue) {
        return i;
      }
    }
    const xValueNum = Number(xValue);
    if (!Number.isNaN(xValueNum)) {
      let bestIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < points.length; i++) {
        const px = extractXValue(points[i]);
        if (typeof px === 'number') {
          const dist = Math.abs(px - xValueNum);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        } else if (typeof px === 'string') {
          const pxNum = Number(px);
          if (!Number.isNaN(pxNum)) {
            const dist = Math.abs(pxNum - xValueNum);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }
        }
      }
      if (bestIdx !== -1) {
        return bestIdx;
      }
    }
    for (let i = 0; i < points.length; i++) {
      const px = extractXValue(points[i]);
      if (typeof px === 'string') {
        return i;
      }
    }
  }
  if (points.length > 0) {
    return 0;
  }
  return -1;
}

/**
 * Type guard to check if a point is a bar chart point with x and y coordinates.
 * @param point - The point to check
 * @returns True if the point is a valid bar point
 */
function isBarPoint(point: any): point is { x: string | number; y: string | number } {
  return point && typeof point === 'object' && 'x' in point && 'y' in point;
}

/**
 * Type guard to check if a point is a line chart point with numeric x and y coordinates.
 * @param point - The point to check
 * @returns True if the point is a valid line point
 */
function isLinePoint(point: any): point is { x: number; y: number; z?: string } {
  return point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number';
}

/**
 * Type guard to check if a point is a histogram point with x range (xMin, xMax).
 * @param point - The point to check
 * @returns True if the point is a valid histogram point
 */
function isHistogramPoint(point: any): point is { x: number; y: number; xMin: number; xMax: number } {
  return point && typeof point === 'object' && 'xMin' in point && 'xMax' in point;
}

/**
 * Type guard to check if a point is a segmented chart point with x, y, and optional z.
 * @param point - The point to check
 * @returns True if the point is a valid segmented point
 */
function isSegmentedPoint(point: any): point is { x: string | number; y: number; z?: string } {
  return point && typeof point === 'object' && 'x' in point && 'y' in point;
}

/**
 * Type guard to check if a point is a smooth plot point with numeric x and y coordinates.
 * @param point - The point to check
 * @returns True if the point is a valid smooth point
 */
function isSmoothPoint(point: any): point is { x: number; y: number } {
  return point && typeof point === 'object' && typeof point.x === 'number' && typeof point.y === 'number';
}

/**
 * Type guard to check if a point is a candlestick point with a value property.
 * @param point - The point to check
 * @returns True if the point is a valid candlestick point
 */
function isCandlestickPoint(point: any): point is { value: number | string } {
  return point && typeof point === 'object' && 'value' in point;
}

/**
 * Centralized X extraction for all known point types
 * @param point The point object
 * @returns The X value or null if not found
 */
function extractXValue(point: any): XValue | null {
  if (!point)
    return null;
  if (isBarPoint(point) || isLinePoint(point) || isSegmentedPoint(point) || isSmoothPoint(point)) {
    return point.x;
  }
  if (isHistogramPoint(point)) {
    return point.x;
  }
  if (isCandlestickPoint(point)) {
    return point.value;
  }
  // Add more cases as needed
  return null;
}

/**
 * A name without the note a chart may write after it in parentheses:
 * "Complex" for "Complex (Probe → Sense → Respond, Emergent Practices)".
 *
 * @param name - A node's name
 * @returns The name before its note, or the name itself when it has none
 */
function bareName(name: string): string {
  const note = /^(.+?) \([^()]*\)$/.exec(name);
  return note === null ? name : note[1];
}

/**
 * The ways one name can be another thing's, strictest first: exactly, then
 * when one of the two is the other with a note in parentheses after it (see
 * {@link bareName}). Two names with different notes are different things.
 *
 * A search tries every candidate with the first before any with the second,
 * so an exact match anywhere wins over a noted one nearer the cursor.
 */
export const NAME_MATCHES: readonly ((name: string, other: string) => boolean)[] = [
  (name, other) => other === name,
  (name, other) => bareName(other) === name || other === bareName(name),
];

/**
 * Finds the node a name belongs to in a hierarchy or a graph, so a layer
 * switch keeps the reader on the same node when both layers draw it.
 *
 * The cursor's own cell first, when it already carries the name -- of two
 * siblings both called "Other", the reader stays on the one they were on --
 * then the first match at the cursor's depth, then the first at any depth
 * from the top. A name matches exactly, or failing that when one of the two
 * is the other with a note in parentheses after it: one layer of a Cynefin
 * framework announces "Complex (Probe → Sense → Respond, Emergent
 * Practices)" where the other draws "Complex". Two names with different
 * notes are different nodes.
 *
 * @param levels - The nodes, by depth and position, with gaps as null
 * @param name - The name to find
 * @param row - The cursor's depth
 * @param col - The cursor's position at that depth
 * @returns Where the node is, or null when no node carries the name
 */
export function findNamedCell(
  levels: readonly (readonly ({ name: string } | null | undefined)[])[],
  name: string,
  row: number,
  col: number,
): Coordinate | null {
  for (const matches of NAME_MATCHES) {
    const at = (depth: number, index: number): boolean => {
      const node = levels[depth]?.[index];
      return node !== null && node !== undefined && matches(name, node.name);
    };
    if (at(row, col)) {
      return { row, col };
    }
    const sameDepth = levels[row]?.findIndex((_, index) => at(row, index)) ?? -1;
    if (sameDepth !== -1) {
      return { row, col: sameDepth };
    }
    for (let depth = 0; depth < levels.length; depth++) {
      const index = levels[depth].findIndex((_, other) => at(depth, other));
      if (index !== -1) {
        return { row: depth, col: index };
      }
    }
  }
  return null;
}
