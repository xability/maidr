/**
 * The adapter-level way to state a percentile band (fan chart).
 *
 * Most libraries draw a fan chart's bands with something that has no place to
 * carry a `maidr` block -- an ECharts stack, an ApexCharts `rangeArea`, a Plot
 * `areaY`, a Google interval column, a Victory `VictoryArea`, an MUI X stacked
 * series. What the block would have said is said instead in the options the
 * adapter is called with: which series draws the median, which draw the bands,
 * and the two quantile levels each band's edges are. The levels go through the
 * same validator the co-located declaration does, so a percentage, a band that
 * does not straddle the median and bands that do not nest are refused in the
 * same words.
 *
 * Each adapter resolves the names against what its library draws and reads
 * the edges from the drawn series; this module holds the parts they share.
 */

import type { PercentileBandRef } from '@type/declaration';
import type { PercentileBandPoint, PercentileBandQuantile } from '@type/grammar';
import { TraceType } from '@type/grammar';
import { validateDeclaration } from './traceDeclaration';

/**
 * One fan chart, as an adapter option states it.
 *
 * @example
 * // a median with a 90% and a 50% band
 * {
 *   median: 'Median',
 *   bands: [
 *     { series: 'p5-p95', lower: 0.05, upper: 0.95 },
 *     { series: 'p25-p75', lower: 0.25, upper: 0.75 },
 *   ],
 * }
 */
export interface PercentileBandOption {
  /** The series drawing the median line, named the way the adapter names series. */
  median: string;
  /**
   * The bands around the median, in any order; each names the series that
   * draws it and the quantile levels of its low and high edge, as fractions.
   */
  bands: PercentileBandRef[];
  /** Overrides the layer's announced title. */
  title?: string;
  /** Names the layer among its siblings. */
  name?: string;
}

/** One fan chart that passed validation, its bands outermost first. */
export interface PercentileBandPlan {
  /** The median's series name. */
  median: string;
  /** The bands, sorted outermost (lowest `lower`) first. */
  bands: PercentileBandRef[];
  title?: string;
  name?: string;
  /** Where the option was written, for warnings: `percentileBands[0]`. */
  where: string;
  /** The author's own entry, which warnings are said once per. */
  source: object;
}

/** A band resolved to the values it draws, as {@link percentileBandPoints} takes it. */
export interface ResolvedBandEdges {
  lower: number;
  upper: number;
  /**
   * The band's two edges at one median position, `null` where it draws
   * nothing there; `undefined` means the same.
   */
  edgesAt: (position: number) => readonly [number | null, number | null] | undefined;
}

/** The block handed to the validator for each author entry, kept so warnings say once. */
const blocks = new WeakMap<object, object>();

/** Sentences already said about one author entry. */
const said = new WeakMap<object, Set<string>>();

/**
 * Warns once per author entry.
 *
 * @param adapter - The adapter name in the `[MAIDR <Adapter>]` prefix
 * @param source - The author's entry the warning is about
 * @param message - The sentence after the prefix
 */
function warnOnce(adapter: string, source: object, message: string): void {
  const seen = said.get(source) ?? new Set<string>();
  said.set(source, seen);
  if (seen.has(message)) {
    return;
  }
  seen.add(message);
  console.warn(`[MAIDR ${adapter}] ${message}`);
}

/**
 * Validates an adapter's `percentileBands` option.
 *
 * An entry that is not an object, or names no median, is reported and left
 * out. The rest -- the bands, a title and a name -- is checked by the shared
 * declaration validator, so the levels are held to exactly the rules the
 * co-located block is: fractions, each band straddling the median, and bands
 * that nest. An entry it refuses is left out, and its series are read as the
 * undeclared chart reads them.
 *
 * @param option - What the author passed
 * @param adapter - The adapter name, for warnings
 * @param optionName - The option's own name, for warnings
 * @returns One plan per usable entry, in the order given
 */
export function readPercentileBandOptions(
  option: unknown,
  adapter: string,
  optionName = 'percentileBands',
): PercentileBandPlan[] {
  if (option === undefined || option === null) {
    return [];
  }
  if (!Array.isArray(option)) {
    console.warn(
      `[MAIDR ${adapter}] ${optionName} is not a list of { median, bands }; ignored.`,
    );
    return [];
  }

  const plans: PercentileBandPlan[] = [];
  option.forEach((entry: unknown, index) => {
    const where = `${optionName}[${index}]`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      console.warn(`[MAIDR ${adapter}] ${where} is not an object of { median, bands }; ignored.`);
      return;
    }
    const { median, ...rest } = entry as Record<string, unknown>;
    if (typeof median !== 'string' || median === '') {
      warnOnce(adapter, entry, `${where} names no median series; expected a non-empty string; ignored.`);
      return;
    }

    let block = blocks.get(entry);
    if (block === undefined) {
      block = { ...rest, type: TraceType.PERCENTILE_BAND };
      blocks.set(entry, block);
    }
    const declared = validateDeclaration(
      block,
      { adapter, seriesRef: `${where} (median "${median}")` },
      [TraceType.PERCENTILE_BAND],
    );
    if (declared === null) {
      return;
    }
    plans.push({
      median,
      bands: [...declared.bands].sort((a, b) => a.lower - b.lower),
      ...(declared.title !== undefined ? { title: declared.title } : {}),
      ...(declared.name !== undefined ? { name: declared.name } : {}),
      where,
      source: entry,
    });
  });
  return plans;
}

/**
 * Reports a median the chart does not draw as a line, once per entry.
 *
 * @param adapter - The adapter name
 * @param plan - The fan chart
 * @param why - What is wrong, phrased to follow "which": `'this chart does not have'`
 */
export function warnUnreadMedian(adapter: string, plan: PercentileBandPlan, why: string): void {
  warnOnce(
    adapter,
    plan.source,
    `${plan.where} names "${plan.median}" as the median, which ${why}; `
    + 'reading its series as the undeclared chart.',
  );
}

/**
 * Reports a band that cannot be read, once per entry. The fan keeps its other
 * bands.
 *
 * @param adapter - The adapter name
 * @param plan - The fan chart
 * @param series - The band's name as the author wrote it
 * @param why - What is wrong, phrased to follow "which": `'this chart does not have'`
 */
export function warnUnreadBand(adapter: string, plan: PercentileBandPlan, series: string, why: string): void {
  warnOnce(
    adapter,
    plan.source,
    `${plan.where} names "${series}" as a band of "${plan.median}", which ${why}; `
    + 'emitting the layer without it.',
  );
}

/**
 * Builds a fan chart's points: one per median position, carrying each band's
 * low edge from the outermost in, the median at 0.5, then each high edge from
 * the innermost out -- the order `PercentileBandTrace` reads its rows in. A
 * band that draws nothing at a position is a gap there.
 *
 * @param medians - The median's positions and values, in drawn order; a
 *                  position whose value is not a finite number is left out
 * @param bands - The bands, outermost first
 * @returns The layer's points
 */
export function percentileBandPoints(
  medians: readonly { x: number | string; value: number | null }[],
  bands: readonly ResolvedBandEdges[],
): PercentileBandPoint[] {
  const points: PercentileBandPoint[] = [];
  medians.forEach(({ x, value }, position) => {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    const edges = bands.map(band => band.edgesAt(position));
    const finite = (edge: number | null | undefined): number | null =>
      typeof edge === 'number' && Number.isFinite(edge) ? edge : null;
    const quantiles: PercentileBandQuantile[] = [
      ...bands.map((band, i) => ({ level: band.lower, value: finite(edges[i]?.[0]) })),
      { level: 0.5, value },
      ...bands.map((band, i) => ({ level: band.upper, value: finite(edges[i]?.[1]) })).reverse(),
    ];
    points.push({ x, quantiles });
  });
  return points;
}
