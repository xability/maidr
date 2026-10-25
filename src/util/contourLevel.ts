import type { ContourPoint } from '@type/grammar';

/**
 * The level one contour curve is drawn at: the first finite `level` a point
 * of it carries, or NaN where none of its points declares one.
 *
 * @param curve - One curve's points
 * @returns The curve's level, or NaN
 */
export function contourCurveLevel(curve: readonly ContourPoint[]): number {
  for (const point of curve) {
    if (typeof point.level === 'number' && Number.isFinite(point.level)) {
      return point.level;
    }
  }
  return Number.NaN;
}

/**
 * How many levels a contour layer draws.
 *
 * A level drawn as several islands arrives as several curves carrying one
 * number, and counts once. A curve that declares no level counts as a level of
 * its own, since nothing says it shares one with another curve.
 *
 * @param curves - The layer's curves
 * @returns The number of levels
 */
export function contourLevelCount(curves: readonly (readonly ContourPoint[])[]): number {
  const declared = new Set<number>();
  let undeclared = 0;
  for (const curve of curves) {
    const level = contourCurveLevel(curve);
    if (Number.isNaN(level)) {
      undeclared += 1;
    } else {
      declared.add(level);
    }
  }
  return declared.size + undeclared;
}
