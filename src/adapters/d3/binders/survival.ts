/**
 * D3 binder for Kaplan-Meier survival curves.
 *
 * A survival curve is a step line — `d3.line().curve(d3.curveStepAfter)` over
 * one `<path>` per arm — so the extraction is `binders/line.ts`'s, reading the
 * same `x`, `y` and `fill` off the same data. What a survival figure carries
 * beyond a step chart is the two things it is read for, and both are added on
 * top of that core: which times were **censored**, and how wide the
 * **confidence band** is at each time.
 *
 * Censoring marks are the awkward part. They are drawn as ticks from their own
 * data join rather than as vertices of the curve, precisely because censoring
 * does not change the estimate — so they arrive as a second selection whose
 * times are not, in general, times the curve has a vertex at. The binder
 * merges them into the arm they belong to by time: flagging the vertex already
 * there, or inserting one carrying the probability the curve holds across that
 * interval.
 */

import type { SurvivalPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3SurvivalConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { buildNoElementsError, finalizeSingleChart, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';
import { buildLineLayer, sampleLineDatum } from './line';

/**
 * Whether a value means "this subject was censored".
 *
 * Read strictly rather than by truthiness: survival data carries the flag as a
 * boolean, as a 0/1 indicator, or as the string one of those was parsed from,
 * and `'0'` is truthy in every one of those readings but censors nobody.
 *
 * @param value - Whatever the `censored` accessor produced
 * @returns True when the value marks a censored time
 */
function isCensored(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  if (typeof value === 'string') {
    return value === '1' || value === 'true';
  }
  return false;
}

/**
 * Reads a confidence bound off a datum, keeping only a finite number.
 *
 * @param datum - The datum bound to the sample
 * @param accessor - The bound's accessor
 * @param index - The sample's index within its selection
 * @returns The bound, or `undefined` when the chart declares none here
 */
function readBound(
  datum: unknown,
  accessor: DataAccessor<number>,
  index: number,
): number | undefined {
  const raw = resolveAccessorOptional<number>(datum, accessor, index);
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * What one arm needs to know while its ticks are read.
 *
 * Both maps are built once for the arm rather than per tick: the whole point
 * of the pass is that no tick rescans the curve.
 */
interface ArmMerge {
  /** The curve's vertices by time, so a tick landing on one just flags it. */
  byTime: Map<number | string, SurvivalPoint>;
  /** The times already queued, so two ticks at one time are one point. */
  queued: Set<number | string>;
  /** The times to insert, in the order the ticks were read. */
  times: number[];
}

/**
 * Flags the vertex a censoring tick lands on, or queues the tick for
 * insertion.
 *
 * A tick whose time is already a vertex of the curve just flags that vertex —
 * including one an earlier tick queued, so two ticks at the same time are one
 * censored point rather than two. Anything else has to be placed between two
 * vertices, which {@link mergeCensoredTimes} does for the whole arm at once.
 *
 * @param arm - The curve the tick belongs to, in ascending time order
 * @param merge - What has been read for this arm so far
 * @param time - The censored time
 * @param index - The tick's index within its selection, for the error message
 * @throws Error when the arm's times cannot be compared with the tick's
 */
function placeCensoredTime(
  arm: SurvivalPoint[],
  merge: ArmMerge,
  time: number | string,
  index: number,
): void {
  const existing = merge.byTime.get(time);
  if (existing !== undefined) {
    existing.censored = true;
    return;
  }
  if (merge.queued.has(time)) {
    return;
  }

  const at = Number(time);
  if (!Number.isFinite(at)) {
    throw new TypeError(
      `The censoring tick at index ${index} is at "${String(time)}", which is `
      + `not a time on its curve and is not a number that could be placed `
      + `between two. Point \`x\` at the tick's own time — the same value the `
      + `curve's samples carry.`,
    );
  }
  if (arm.length === 0) {
    throw new Error(
      `The censoring tick at index ${index} has no curve to merge into: the `
      + `arm it names carries no samples.`,
    );
  }

  merge.queued.add(at);
  merge.times.push(at);
}

/**
 * Rebuilds one arm with its queued censoring times merged in.
 *
 * Both sequences run in ascending time order — the arm because it is the
 * curve's own vertex order, the times because they are sorted here — so one
 * cursor walks them together. Splicing each tick into the row instead
 * rescanned and re-shifted the whole arm per tick, which on a registry-scale
 * curve is millions of comparisons and element moves inside a synchronous
 * bind that re-runs on every React re-bind.
 *
 * Each inserted vertex carries the probability — and the band — the curve
 * holds across the interval it falls in, which is what the estimate says
 * there: a censored time is a subject leaving, not a step. A tick before the
 * curve's first vertex takes that vertex's probability, which on a
 * Kaplan-Meier curve is the 1.0 it starts at.
 *
 * @param arm - The curve to merge into, in ascending time order
 * @param times - The times to insert, none of them already a vertex
 * @returns The merged curve, or the arm itself when there is nothing to insert
 */
function mergeCensoredTimes(arm: SurvivalPoint[], times: number[]): SurvivalPoint[] {
  if (times.length === 0) {
    return arm;
  }

  const merged: SurvivalPoint[] = [];
  let cursor = 0;
  let held: SurvivalPoint | undefined;
  for (const at of [...times].sort((a, b) => a - b)) {
    while (cursor < arm.length && Number(arm[cursor].x) <= at) {
      held = arm[cursor];
      merged.push(arm[cursor]);
      cursor += 1;
    }
    const source = held ?? arm[0];
    const inserted: SurvivalPoint = { x: at, y: source.y, censored: true };
    if (source.z !== undefined) {
      inserted.z = source.z;
    }
    if (source.yMin !== undefined) {
      inserted.yMin = source.yMin;
    }
    if (source.yMax !== undefined) {
      inserted.yMax = source.yMax;
    }
    merged.push(inserted);
  }
  for (; cursor < arm.length; cursor += 1) {
    merged.push(arm[cursor]);
  }
  return merged;
}

/**
 * Merges every censoring tick drawn by a separate join into the curves.
 *
 * Each tick names its arm the way the curve's own samples do — through `fill`
 * — and a single-curve chart needs no naming at all. A tick naming an arm the
 * chart does not draw is an error rather than a silent drop: it is a subject
 * the reader would never be told about.
 *
 * @param root - The extraction root (the SVG, or a panel element)
 * @param config - The binder config
 * @param arms - The curves the line core produced, in row order
 * @throws Error when the selector matches nothing, or a tick names no arm
 */
function mergeCensoredTicks(
  root: Element,
  config: D3SurvivalConfig,
  arms: SurvivalPoint[][],
): void {
  const { censoredSelector } = config;
  if (censoredSelector === undefined) {
    return;
  }

  const ticks = queryD3Elements(root, censoredSelector);
  if (ticks.length === 0) {
    throw buildNoElementsError(root, censoredSelector, 'censoring tick');
  }

  const sample = ticks[0].datum;
  const xAccessor = inferAccessor<number | string>(
    config,
    'x',
    'x',
    ['time', 't', 'date'],
    sample,
  );
  const fillAccessor = inferAccessor<string>(
    config,
    'fill',
    'fill',
    ['group', 'arm', 'series', 'strata', 'z'],
    sample,
  );

  // Read in DOM order, so a chart with more than one unreadable tick still
  // reports the first of them. Each arm is indexed once, on the first tick
  // that names it, and the times to insert are collected rather than spliced
  // in one at a time; the arms are rebuilt below.
  const merges = new Map<number, ArmMerge>();

  for (const { datum, index } of ticks) {
    const time = resolveAccessor<number | string>(datum, xAccessor, index);
    const fill = resolveAccessorOptional<string>(datum, fillAccessor, index);

    let row = 0;
    if (fill !== undefined && fill !== null) {
      row = arms.findIndex(arm => arm[0]?.z === fill);
      if (row === -1) {
        throw new Error(
          `The censoring tick at index ${index} names the arm "${String(fill)}", `
          + `which no curve matched by "${config.selector}" is drawn for. The `
          + `ticks and the curves have to name their arms the same way — `
          + `check the \`fill\` accessor.`,
        );
      }
    } else if (arms.length > 1) {
      throw new Error(
        `The censoring tick at index ${index} names no arm, and the chart draws `
        + `${arms.length} of them. Give the ticks the same \`fill\` their `
        + `curves carry, so each tick can be merged into the curve it belongs to.`,
      );
    }

    let merge = merges.get(row);
    if (merge === undefined) {
      const byTime = new Map<number | string, SurvivalPoint>();
      for (const point of arms[row]) {
        if (!byTime.has(point.x)) {
          byTime.set(point.x, point);
        }
      }
      merge = { byTime, queued: new Set<number | string>(), times: [] };
      merges.set(row, merge);
    }

    placeCensoredTime(arms[row], merge, time, index);
  }

  for (const [row, merge] of merges) {
    arms[row] = mergeCensoredTimes(arms[row], merge.times);
  }
}

/**
 * Binds a D3.js Kaplan-Meier survival curve to MAIDR, generating the
 * accessible data representation.
 *
 * Point `selector` at the step paths — one per arm — exactly as with
 * {@link bindD3Line}, and `fill` at whatever names the arm. Everything a
 * survival figure adds is optional and read from the same data:
 *
 * - **Censoring.** Either the curve's samples carry a `censored` column, or
 *   the ticks are their own selection — set `censoredSelector` and the binder
 *   merges each tick into its arm by time.
 * - **The confidence band.** `yMin` and `yMax` are announced alongside the
 *   estimate, which is the comparison a reader makes when two arms look
 *   separated.
 *
 * The trace derives median survival itself, so nothing here computes it.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 survival curve.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Survival(svgElement, {
 *   selector: 'path.km-curve',
 *   censoredSelector: 'line.censor-tick',
 *   title: 'Overall Survival',
 *   axes: { x: 'Months', y: 'Survival probability', fill: 'Arm' },
 *   x: 'time',
 *   y: 'surv',
 *   fill: 'arm',
 *   yMin: 'lower',
 *   yMax: 'upper',
 * });
 * ```
 */
export function bindD3Survival(svg: Element, config: D3SurvivalConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildSurvivalLayer(svg, config));
}

/**
 * Pure extraction core for survival curves. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildSurvivalLayer(
  root: Element,
  config: D3SurvivalConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const sample = sampleLineDatum(root, config);
  const censoredAccessor = inferAccessor<unknown>(
    config,
    'censored',
    'censored',
    ['censor', 'isCensored'],
    sample,
  );
  const yMinAccessor = inferAccessor<number>(
    config,
    'yMin',
    'yMin',
    ['lower', 'lo', 'ciLower', 'low'],
    sample,
  );
  const yMaxAccessor = inferAccessor<number>(
    config,
    'yMax',
    'yMax',
    ['upper', 'hi', 'ciUpper', 'high'],
    sample,
  );

  // A Kaplan-Meier estimate holds until an event drops it, which is what
  // `d3.curveStepAfter` draws and what this file's own description says the
  // curve is -- so the convention is known here and does not need declaring.
  // The config field is still the override, for a curve drawn the other way
  // round with `curveStepBefore`. `SurvivalTrace extends StepTrace`, so this
  // is the field it announces the direction from (#1066).
  const stepped: D3SurvivalConfig = {
    ...config,
    stepDirection: config.stepDirection ?? 'hv',
  };

  const built = buildLineLayer(root, stepped, panel, TraceType.SURVIVAL, (point, datum, index) => {
    const survival = point as SurvivalPoint;
    if (isCensored(resolveAccessorOptional<unknown>(datum, censoredAccessor, index))) {
      survival.censored = true;
    }
    const low = readBound(datum, yMinAccessor, index);
    if (low !== undefined) {
      survival.yMin = low;
    }
    const high = readBound(datum, yMaxAccessor, index);
    if (high !== undefined) {
      survival.yMax = high;
    }
  });

  // The ticks are merged after the curves are built, because a tick's time is
  // placed relative to the vertices the core has just read.
  mergeCensoredTicks(root, config, built.layer.data as SurvivalPoint[][]);

  return built;
}
