import type { MaidrLayer } from '@type/grammar';
import { PieDirection } from '@type/grammar';

/**
 * Where a pie's ring begins and which way it runs, in the grammar's terms.
 *
 * Every charting library measures a pie's start angle from somewhere and in
 * some direction of its own — matplotlib, ECharts and Recharts count degrees
 * counterclockwise from 3 o'clock, amCharts clockwise from 3 o'clock,
 * Highcharts, Chart.js, AnyChart and Victory clockwise from 12 — and the
 * grammar takes one: `startAngle` in degrees clockwise from 12 o'clock and
 * `direction` for the way the slices follow one another from there. These
 * helpers do the conversions once, so every adapter declares the same thing
 * the same way and the trace walks every pie clockwise from where it really
 * starts.
 */

/**
 * Normalizes an angle to `[0, 360)`.
 *
 * @param degrees - Any angle in degrees
 * @returns The same point on the dial, in `[0, 360)`
 */
export function clockDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Converts an angle measured counterclockwise from 3 o'clock — the
 * mathematical convention matplotlib, ECharts and Recharts use — to degrees
 * clockwise from 12 o'clock.
 *
 * @param degrees - Degrees counterclockwise from 3 o'clock
 * @returns Degrees clockwise from 12 o'clock, in `[0, 360)`
 */
export function clockFromCounterclockwiseOf3(degrees: number): number {
  return clockDegrees(90 - degrees);
}

/**
 * Converts an angle measured clockwise from 3 o'clock — amCharts' convention,
 * where a pie's default `startAngle` of `-90` is the top — to degrees
 * clockwise from 12 o'clock.
 *
 * @param degrees - Degrees clockwise from 3 o'clock
 * @returns Degrees clockwise from 12 o'clock, in `[0, 360)`
 */
export function clockFromClockwiseOf3(degrees: number): number {
  return clockDegrees(degrees + 90);
}

/**
 * The two dial keys of a pie layer, with each left out at the grammar's
 * default: a clockwise ring from 12 o'clock declares nothing, which is what
 * every layer declared before the keys existed.
 *
 * @param startAngle - Where the ring begins, degrees clockwise from 12 o'clock
 * @param clockwise - Whether the slices follow one another clockwise
 * @returns The keys to spread into the layer
 */
export function pieGeometry(
  startAngle: number,
  clockwise: boolean,
): Pick<MaidrLayer, 'startAngle' | 'direction'> {
  const start = clockDegrees(startAngle);
  return {
    ...(start !== 0 ? { startAngle: start } : {}),
    ...(clockwise ? {} : { direction: PieDirection.COUNTERCLOCKWISE }),
  };
}

/**
 * Whether a finite number was given.
 *
 * @param value - A setting read off a chart, of whatever type it came as
 * @returns True when it is a usable angle
 */
export function isAngle(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
