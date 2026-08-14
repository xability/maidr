/**
 * D3 binder for boxen (letter-value) plots.
 *
 * Extracts the ladder of quantiles each distribution was drawn from and
 * generates the MAIDR JSON schema for accessible interaction. Structurally this
 * is `binders/box.ts` with a variable number of rungs instead of a fixed
 * five-number summary — which is the whole point of a letter-value plot: a
 * large sample gets *more* rungs, so its tails stay legible.
 *
 * The ladder is read from the datum, never measured off the rendered rungs. A
 * boxen computes its quantiles before it draws them, and a height in pixels is
 * a layout fact rather than a quantile.
 */

import type { BoxenPoint, LetterValueLevel, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BoxenConfig, D3BuiltLayer, DataAccessor } from '../types';
import { Orientation, TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/** Keys a rung's tail probability is carried under, canonical first. */
const P_KEYS = ['p', 'prob', 'probability', 'depth'] as const;

/** Keys a rung's lower quantile is carried under, canonical first. */
const LO_KEYS = ['lo', 'lower', 'low', 'min', 'y0'] as const;

/** Keys a rung's upper quantile is carried under, canonical first. */
const HI_KEYS = ['hi', 'upper', 'high', 'max', 'y1'] as const;

/**
 * Reads one number off a rung, trying each key in turn.
 *
 * @param rung - One entry of the ladder
 * @param keys - The keys to try, canonical first
 * @returns The number, or `undefined` when the rung carries none of them
 */
function readRungValue(rung: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    if (key in rung) {
      const value = Number(rung[key]);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Normalizes the ladder a distribution declares into {@link LetterValueLevel}s.
 *
 * A rung whose three numbers are not all present and finite is dropped rather
 * than emitted: a rung is a labelled position on the distribution, and one
 * carrying `NaN` would be announced as a percentile the data never computed.
 * The order is left alone — the trace sorts the ladder outward from the median
 * itself, so a producer emitting it inward-first is read correctly either way.
 *
 * @param raw - Whatever the `levels` accessor produced
 * @param index - Position of the distribution in the selection
 * @returns The rungs the payload carries
 * @throws Error when the accessor produced no array at all
 */
function resolveLevels(raw: unknown, index: number): LetterValueLevel[] {
  if (!Array.isArray(raw)) {
    throw new TypeError(
      `The distribution at index ${index} has no ladder: the \`levels\` `
      + `accessor resolved to ${String(raw)} rather than an array of `
      + `{ p, lo, hi } rungs. A boxen is that ladder — without it the chart is `
      + `a box plot, and \`bindD3Box\` reads it.`,
    );
  }

  const levels: LetterValueLevel[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') {
      continue;
    }
    const rung = entry as Record<string, unknown>;
    const p = readRungValue(rung, P_KEYS);
    const lo = readRungValue(rung, LO_KEYS);
    const hi = readRungValue(rung, HI_KEYS);
    if (p === undefined || lo === undefined || hi === undefined) {
      continue;
    }
    levels.push({ p, lo, hi });
  }
  return levels;
}

/**
 * Reads an outlier list, keeping only the numbers in it.
 *
 * @param datum - The datum bound to the distribution's element
 * @param accessor - The outlier accessor
 * @param index - Position of the distribution in the selection
 * @returns The outliers, or `undefined` when the chart declares none
 */
function readOutliers(
  datum: unknown,
  accessor: DataAccessor<number[]>,
  index: number,
): number[] | undefined {
  const raw = resolveAccessorOptional<number[]>(datum, accessor, index);
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const values = raw.map(Number).filter(value => Number.isFinite(value));
  return values.length > 0 ? values : undefined;
}

/**
 * Binds a D3.js boxen (letter-value) plot to MAIDR, generating the accessible
 * data representation.
 *
 * Point `selector` at one element per distribution — the `<g>` holding that
 * category's stack of nested rungs — the way {@link bindD3Box} points at a box
 * group. Every rung of a distribution highlights that group: a chart does not
 * draw an element per quantile that MAIDR could pair up positionally, and
 * inventing one would highlight geometry the chart never drew.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** Like every D3 binder, this reads
 * each matched element's D3-bound `__data__`; calling it before
 * `.data().join()` has run (or before the SVG is mounted) throws "No elements
 * found for selector …" or "Property '…' not found on datum".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 boxen plot.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * // One <g> per distribution, its datum carrying the ladder the rungs
 * // were drawn from.
 * const result = bindD3Boxen(svgElement, {
 *   selector: 'g.boxen',
 *   title: 'Response Time by Group',
 *   axes: { x: 'Group', y: 'Milliseconds' },
 *   x: 'group',
 *   levels: 'letterValues',
 * });
 * ```
 */
export function bindD3Boxen(svg: Element, config: D3BoxenConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildBoxenLayer(svg, config));
}

/**
 * Pure extraction core for boxen plots. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildBoxenLayer(root: Element, config: D3BoxenConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
    orientation = Orientation.VERTICAL,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'boxen group');
  }

  // Infer accessors from the first datum's keys when the user did not specify.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string | number>(
    config,
    'x',
    'x',
    ['z', 'category', 'label', 'name', 'key', 'group'],
    firstDatum,
  );
  const medianAccessor = inferAccessor<number>(
    config,
    'median',
    'median',
    ['q2', 'mid', 'y'],
    firstDatum,
  );
  const levelsAccessor = inferAccessor<unknown[]>(
    config,
    'levels',
    'levels',
    ['letterValues', 'letter_values', 'quantiles', 'ladder'],
    firstDatum,
  );
  const lowerAccessor = inferAccessor<number[]>(
    config,
    'lowerOutliers',
    'lowerOutliers',
    ['lower_outliers', 'outliersLow'],
    firstDatum,
  );
  const upperAccessor = inferAccessor<number[]>(
    config,
    'upperOutliers',
    'upperOutliers',
    ['upper_outliers', 'outliersHigh'],
    firstDatum,
  );

  const data: BoxenPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }

    const point: BoxenPoint = {
      z: String(resolveAccessor<string | number>(datum, xAccessor, index)),
      median: Number(resolveAccessor<number>(datum, medianAccessor, index)),
      levels: resolveLevels(resolveAccessor<unknown[]>(datum, levelsAccessor, index), index),
    };

    const lowerOutliers = readOutliers(datum, lowerAccessor, index);
    if (lowerOutliers !== undefined) {
      point.lowerOutliers = lowerOutliers;
    }
    const upperOutliers = readOutliers(datum, upperAccessor, index);
    if (upperOutliers !== undefined) {
      point.upperOutliers = upperOutliers;
    }

    return point;
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.BOXEN,
    title,
    // One scoped selector matching every distribution: the trace pairs them
    // one-to-one with the ladders and repeats each element across its own
    // rungs, withdrawing highlighting on a count mismatch rather than
    // highlighting a neighbouring distribution.
    selectors: scopeSelector(root, selector, panel),
    orientation,
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
