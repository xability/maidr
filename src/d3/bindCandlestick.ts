/**
 * D3 binder for candlestick charts.
 *
 * Extracts data from D3.js-rendered candlestick chart SVG elements and generates
 * the MAIDR JSON schema for accessible candlestick chart interaction.
 */

import type { CandlestickPoint, CandlestickTrend, Maidr, MaidrLayer } from '../type/grammar';
import type { D3BinderResult, D3CandlestickConfig } from './types';
import { TraceType } from '../type/grammar';
import { buildAxes, generateId, queryD3Elements, resolveAccessor, resolveAccessorOptional, scopeSelector } from './util';

/**
 * Binds a D3.js candlestick chart to MAIDR.
 *
 * Candlestick charts show OHLC (Open, High, Low, Close) data for financial
 * time series. This binder extracts data from D3-bound SVG elements
 * representing candlestick bodies (typically `<rect>`) and optional wicks.
 *
 * @param svg - The SVG element containing the D3 candlestick chart.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * const result = bindD3Candlestick(svgElement, {
 *   selector: 'rect.candle',
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
    trend: trendAccessor,
  } = config;

  const elements = queryD3Elements(svg, selector);
  if (elements.length === 0) {
    throw new Error(
      `No elements found for selector "${selector}". `
      + `Ensure the D3 chart has been rendered and the selector matches the candlestick elements.`,
    );
  }

  const data: CandlestickPoint[] = elements.map(({ datum, index }) => {
    if (!datum) {
      throw new Error(
        `No D3 data bound to element at index ${index}. `
        + `Ensure D3's .data() join has been applied to the "${selector}" elements.`,
      );
    }

    const openVal = resolveAccessor<number>(datum, openAccessor, index);
    const closeVal = resolveAccessor<number>(datum, closeAccessor, index);
    const highVal = resolveAccessor<number>(datum, highAccessor, index);
    const lowVal = resolveAccessor<number>(datum, lowAccessor, index);

    // Compute trend if not provided
    let trend: CandlestickTrend;
    if (trendAccessor) {
      trend = resolveAccessor<CandlestickTrend>(datum, trendAccessor, index);
    } else if (closeVal > openVal) {
      trend = 'Bull';
    } else if (closeVal < openVal) {
      trend = 'Bear';
    } else {
      trend = 'Neutral';
    }

    const volumeVal = resolveAccessorOptional<number>(datum, volumeAccessor, index) ?? 0;

    return {
      value: resolveAccessor<string>(datum, valueAccessor, index),
      open: openVal,
      high: highVal,
      low: lowVal,
      close: closeVal,
      volume: volumeVal,
      trend,
      volatility: highVal - lowVal,
    };
  });

  const layerId = generateId();
  const layer: MaidrLayer = {
    id: layerId,
    type: TraceType.CANDLESTICK,
    title,
    selectors: scopeSelector(svg, selector),
    axes: buildAxes(axes, format),
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
