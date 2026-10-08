/**
 * D3 binder for percentile bands (fan charts).
 *
 * A fan chart is a median line and nested bands of quantiles around it, each
 * band one `d3.area()` path between a low and a high edge -- a forecast's
 * prediction intervals, a distribution over training steps. The median and
 * every band are separate paths whose datum is their own rows, so each is
 * read off its own path and the bands are matched to the median by position.
 *
 * Nothing in an area says which quantiles its edges are, so each band states
 * its two levels, and they are held to the rules the co-located `maidr`
 * declaration's bands are held to -- through the same validator, in the same
 * words.
 */

import type { MaidrLayer, PercentileBandPoint, PercentileBandQuantile } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3PercentileBand, D3PercentileBandConfig, DataAccessor } from '../types';
import { TraceType } from '../../../type/grammar';
import { validateDeclaration } from '../../shared/traceDeclaration';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * The key a position is matched by: a `Date` by its time, since two `Date`s
 * for one instant are different objects, and anything else as it is.
 *
 * @param value - The position
 * @returns A key two equal positions share
 */
function positionKey(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

/**
 * The rows bound to the one path a selector names.
 *
 * @param root - The extraction root
 * @param selector - The path's selector
 * @param what - What the path draws, for the error
 * @returns The path and its rows
 * @throws Error when the selector matches no path, or one with no rows bound
 */
function rowsOf(root: Element, selector: string, what: string): { element: Element; rows: unknown[] } {
  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, what);
  }
  const { element, datum } = elements[0];
  if (!Array.isArray(datum)) {
    throw buildNoDatumError(selector, 0);
  }
  return { element, rows: datum };
}

/**
 * Reads a finite number, or nothing.
 *
 * @param value - Whatever an accessor produced
 * @returns The number, or null
 */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Binds a D3.js fan chart to MAIDR.
 *
 * @param svg - The SVG element containing the D3 chart.
 * @param config - Configuration naming the median's path and each band's.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * bindD3PercentileBand(svgElement, {
 *   selector: 'path.median',
 *   x: 'step',
 *   y: 'p50',
 *   bands: [
 *     { selector: 'path.band-90', lower: 0.05, upper: 0.95, y0: 'p5', y1: 'p95' },
 *     { selector: 'path.band-50', lower: 0.25, upper: 0.75, y0: 'p25', y1: 'p75' },
 *   ],
 * });
 * ```
 */
export function bindD3PercentileBand(svg: Element, config: D3PercentileBandConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildPercentileBandLayer(svg, config));
}

/**
 * Pure extraction core for fan charts. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildPercentileBandLayer(
  root: Element,
  config: D3PercentileBandConfig,
  panel?: D3PanelScope,
): D3BuiltLayer {
  const { title, axes, format, selector } = config;
  const median = rowsOf(root, selector, 'median line');
  const sample = median.rows[0];
  const xAccessor = inferAccessor<number | string>(config, 'x', 'x', ['date', 'time', 'step'], sample);
  const yAccessor = inferAccessor<number>(config, 'y', 'y', ['median', 'p50', 'value'], sample);

  const declared = validateDeclaration(
    {
      type: TraceType.PERCENTILE_BAND,
      bands: (config.bands ?? []).map(band => ({ series: band.selector, lower: band.lower, upper: band.upper })),
    },
    { adapter: 'D3', seriesRef: `bindD3PercentileBand "${selector}"` },
    [TraceType.PERCENTILE_BAND],
  );
  const bands: D3PercentileBand[] = declared === null
    ? []
    : [...config.bands].sort((a, b) => a.lower - b.lower);

  const edges = bands.map((band) => {
    const { element, rows } = rowsOf(root, band.selector, 'band area');
    const y0 = inferAccessor<number>(band, 'y0', 'y0', ['lower', 'low', 'lo', 'min'], rows[0]);
    const y1 = inferAccessor<number>(band, 'y1', 'y1', ['upper', 'high', 'hi', 'max'], rows[0]);
    const at = new Map<unknown, { low: number | null; high: number | null }>();
    rows.forEach((row, index) => {
      const x = resolveAccessorOptional<unknown>(row, xAccessor as DataAccessor<unknown>, index);
      at.set(positionKey(x), {
        low: finiteOrNull(resolveAccessorOptional(row, y0, index)),
        high: finiteOrNull(resolveAccessorOptional(row, y1, index)),
      });
    });
    return { element, at };
  });

  const data: PercentileBandPoint[] = [];
  median.rows.forEach((row, index) => {
    if (row === undefined || row === null) {
      throw buildNoDatumError(selector, index);
    }
    const x = resolveAccessor<number | string>(row, xAccessor, index);
    const quantiles: PercentileBandQuantile[] = [
      { level: 0.5, value: finiteOrNull(resolveAccessor<number>(row, yAccessor, index)) },
    ];
    bands.forEach((band, i) => {
      const edge = edges[i].at.get(positionKey(x));
      quantiles.push(
        { level: band.lower, value: edge?.low ?? null },
        { level: band.upper, value: edge?.high ?? null },
      );
    });
    data.push({ x, quantiles });
  });

  // One selector per band, outermost first, then the median's line -- the
  // shape `PercentileBandTrace` outlines a bound as the band it bounds in.
  // Emitted only when every one names exactly the one path it was read from,
  // so a selector that also catches a neighbour cannot outline the wrong band.
  const named = [...bands.map(band => band.selector), selector];
  const drawn = [...edges.map(edge => edge.element), median.element];
  const exact = named.every((one, i) => {
    const matches = queryD3Elements(root, one);
    return matches.length === 1 && matches[0].element === drawn[i];
  });
  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.PERCENTILE_BAND,
    title,
    ...(exact ? { selectors: named.map(one => scopeSelector(root, one, panel)) } : {}),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
