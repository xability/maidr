/**
 * D3 binder for precision-recall curves.
 *
 * A precision-recall curve is drawn as a line -- `d3.line()` over one `<path>`
 * per classifier -- so the extraction is `binders/line.ts`'s, reading the
 * same `x`, `y` and `fill`. What the figure carries beyond a line is added on
 * top of that core: the threshold each point was scored at, read off its own
 * datum, and each curve's prevalence and average precision, which describe
 * that curve alone.
 */

import type { PrCurvePoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3PrCurveConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { finalizeSingleChart, inferAccessor, resolveAccessorOptional } from '../util';
import { buildLineLayer, sampleLineDatum } from './line';

/** How this binder names itself in a warning. */
const PREFIX = '[MAIDR D3 bindD3PrCurve]';

/**
 * The rate a config gives one curve, when it gives one that is a rate.
 *
 * A bare number describes the one curve of a single-curve chart and nothing
 * else: lent to every curve of a figure, it would announce a gap above chance
 * for classes that were never scored on equally common positives. A record
 * names each curve by its `fill`. Either way a value outside 0 to 1 is a
 * percentage or a typo, and is refused rather than rescaled.
 *
 * @param given - The config's `prevalence` or `ap`
 * @param field - Which one, for the warning
 * @param name - The curve's `fill` name, when it has one
 * @param curves - How many curves the chart draws
 * @returns The rate, or undefined
 */
function rateFor(
  given: number | Record<string, number> | undefined,
  field: 'prevalence' | 'ap',
  name: string | undefined,
  curves: number,
): number | undefined {
  if (given === undefined) {
    return undefined;
  }
  let value: unknown;
  if (typeof given === 'number') {
    if (curves > 1) {
      return undefined;
    }
    value = given;
  } else {
    value = name === undefined ? undefined : given[name];
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && value >= 0 && value <= 1) {
    return value;
  }
  console.warn(`${PREFIX} ${field} ${String(value)}${name ? ` for "${name}"` : ''} is not a number from 0 to 1; ignored.`);
  return undefined;
}

/**
 * Binds a D3.js precision-recall curve to MAIDR.
 *
 * One `<path>` per classifier, recall along x and precision up y, read
 * exactly as {@link bindD3Line} reads a line; the layer is announced as a
 * precision-recall curve, so a reader hears each point's threshold, the
 * average precision and the best F1, and how far each curve stands above the
 * chance baseline its `prevalence` gives.
 *
 * @param svg - The SVG element containing the D3 curve.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3PrCurve(svgElement, {
 *   selector: 'path.pr',
 *   x: 'recall',
 *   y: 'precision',
 *   fill: 'model',
 *   threshold: 'threshold',
 *   prevalence: { Logistic: 0.3, Forest: 0.3 },
 * });
 * ```
 */
export function bindD3PrCurve(svg: Element, config: D3PrCurveConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildPrCurveLayer(svg, config));
}

/**
 * Pure extraction core for precision-recall curves. See {@link buildBarLayer}
 * for the single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildPrCurveLayer(
  root: Element,
  config: D3PrCurveConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const thresholdAccessor = inferAccessor<number>(
    config,
    'threshold',
    'threshold',
    ['thresholds', 'cutoff'],
    sampleLineDatum(root, config),
  );

  const built = buildLineLayer(root, config, panel, TraceType.PR_CURVE, (point, datum, index) => {
    const threshold = resolveAccessorOptional<number>(datum, thresholdAccessor, index);
    if (typeof threshold === 'number' && Number.isFinite(threshold)) {
      (point as PrCurvePoint).threshold = threshold;
    }
  });

  const curves = built.layer.data as PrCurvePoint[][];
  if (typeof config.prevalence === 'number' && curves.length > 1) {
    console.warn(`${PREFIX} prevalence is one number for ${curves.length} curves; give each curve its own, keyed by its fill.`);
  }
  if (typeof config.ap === 'number' && curves.length > 1) {
    console.warn(`${PREFIX} ap is one number for ${curves.length} curves; give each curve its own, keyed by its fill.`);
  }
  for (const curve of curves) {
    if (curve.length === 0) {
      continue;
    }
    const name = typeof curve[0].z === 'string' ? curve[0].z : undefined;
    const prevalence = rateFor(config.prevalence, 'prevalence', name, curves.length);
    const ap = rateFor(config.ap, 'ap', name, curves.length);
    curve[0] = {
      ...curve[0],
      ...(prevalence === undefined ? {} : { prevalence }),
      ...(ap === undefined ? {} : { ap }),
    };
  }

  return built;
}
