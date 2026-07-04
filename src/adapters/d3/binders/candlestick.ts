/**
 * D3 binder for candlestick charts.
 *
 * Extracts data from D3.js-rendered candlestick chart SVG elements and generates
 * the MAIDR JSON schema for accessible candlestick chart interaction.
 */

import type { CandlestickPoint, CandlestickTrend, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3CandlestickConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/**
 * Binds a D3.js candlestick chart to MAIDR.
 *
 * Candlestick charts show OHLC (Open, High, Low, Close) data for financial
 * time series. This binder extracts data from D3-bound SVG elements
 * representing candlestick bodies (typically `<rect>`) and optional wicks.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** This function reads each matched
 * element's D3-bound `__data__`: the OHLC + volume bound to each candlestick
 * body. Calling it before `.data().join()` has run (or before the SVG is
 * mounted) throws "No elements found for selector …" or "Property '…' not
 * found on datum".
 *
 * Typical call sites:
 * - **Vanilla JS:** right after your `selectAll(...).data(...).join(...)` chain.
 * - **React:** inside `useEffect`, never during render. Prefer
 *   {@link MaidrD3} / {@link useD3Adapter} from `maidr/react`, which
 *   handle the post-render timing for you.
 * - **Async data:** inside the `.then(...)` of your fetch, after drawing.
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
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
  return finalizeSingleChart(svg, config, buildCandlestickLayer(svg, config));
}

/**
 * Pure extraction core for candlestick charts. See {@link buildBarLayer} for
 * the single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildCandlestickLayer(root: Element, config: D3CandlestickConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
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

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'candlestick');
  }

  const data: CandlestickPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
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

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.CANDLESTICK,
    title,
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
