/**
 * D3 binder for candlestick (OHLC) charts.
 *
 * Extracts data from D3.js-rendered candlestick chart SVG elements and generates
 * the MAIDR JSON schema for accessible candlestick chart interaction.
 */

import type { CandlestickPoint, CandlestickTrend, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3CandlestickConfig } from './types';
import { TraceType } from '../type/grammar';
import { generateId, queryD3Elements, resolveAccessor, scopeSelector } from './util';

/**
 * Binds a D3.js candlestick chart to MAIDR, generating the accessible data representation.
 *
 * Candlestick charts display OHLC (Open, High, Low, Close) financial data.
 * Each candle is typically rendered as a group with a rect (body) and lines (wicks).
 *
 * @param svg - The SVG element containing the D3 candlestick chart.
 * @param config - Configuration specifying selectors and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Candlestick(svgElement, {
 *   selector: 'g.candle',
 *   title: 'Stock Price',
 *   axes: { x: 'Date', y: 'Price ($)' },
 *   value: 'date',
 *   open: 'open',
 *   high: 'high',
 *   low: 'low',
 *   close: 'close',
 *   volume: 'volume',
 * });
 * ```
 */
export function bindD3Candlestick(svg: Element, config: D3CandlestickConfig): D3BinderResult {
  const {
    id = generateId(),
    title,
    subtitle,
    caption,
    axes,
    format,
    selector,
    value: valueAccessor = 'value',
    open: openAccessor = 'open',
    high: highAccessor = 'high',
    low: lowAccessor = 'low',
    close: closeAccessor = 'close',
    volume: volumeAccessor = 'volume',
  } = config;

  const elements = queryD3Elements(svg, selector);

  const data: CandlestickPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }

    const open = resolveAccessor<number>(datum, openAccessor, index) as number;
    const close = resolveAccessor<number>(datum, closeAccessor, index) as number;
    const high = resolveAccessor<number>(datum, highAccessor, index) as number;
    const low = resolveAccessor<number>(datum, lowAccessor, index) as number;
    const volume = resolveAccessor<number>(datum, volumeAccessor, index) ?? 0;

    let trend: CandlestickTrend;
    if (close > open)
      trend = 'Bull';
    else if (close < open)
      trend = 'Bear';
    else
      trend = 'Neutral';

    const range = high - low;
    const volatility = range > 0 ? Math.round((range / low) * 10000) / 100 : 0;

    return {
      value: String(resolveAccessor<string>(datum, valueAccessor, index)),
      open,
      high,
      low,
      close,
      volume: volume as number,
      trend,
      volatility,
    };
  });

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.CANDLESTICK,
    title,
    selectors: scopeSelector(svg, selector),
    axes: axes
      ? {
          ...axes,
          ...(format ? { format } : {}),
        }
      : undefined,
    data,
  };

  const maidr: Maidr = {
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [layer] }]],
  };

  return { maidr, layer };
}
