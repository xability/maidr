/**
 * D3 binder for candlestick charts.
 *
 * Extracts data from D3.js-rendered candlestick chart SVG elements and generates
 * the MAIDR JSON schema for accessible candlestick chart interaction.
 */

import type { CandlestickPoint, CandlestickSelector, CandlestickTrend, MaidrLayer } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3CandlestickConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector, stampOrderedSelectors } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, queryD3Elements, resolveAccessor, resolveAccessorOptional } from '../util';

/** The attribute each candle's wick is stamped with, by its candle's index. */
const WICK_ATTRIBUTE = 'data-maidr-wick';

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
 *   wickSelector: 'line.wick',
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
    wickSelector,
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

    // `CandlestickPoint.volume` is optional so that "absent" and "zero" stay
    // apart, and `Candlestick.description` renders a blank cell for absent.
    // Filling it with `0` turns an OHLC chart with no volume column into a
    // table saying no shares traded on any day, which a reader quotes back as
    // a finding rather than as something the chart never said.
    const volumeVal = resolveAccessorOptional<number>(datum, volumeAccessor, index);

    return {
      value: resolveAccessor<string>(datum, valueAccessor, index),
      open: openVal,
      high: highVal,
      low: lowVal,
      close: closeVal,
      ...(typeof volumeVal === 'number' && Number.isFinite(volumeVal)
        ? { volume: volumeVal }
        : {}),
      trend,
      volatility: highVal - lowVal,
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.CANDLESTICK,
    title,
    selectors: candleSelectors(root, selector, wickSelector, elements, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}

/**
 * The layer's selectors: the bodies alone, or the bodies and their wicks.
 *
 * A string is one element per candle, and the core outlines it for every
 * price of the candle -- so the high and the low, read off the ends of the
 * wick, outlined the body, and moving between a candle's prices moved nothing.
 * Given the wicks, the core outlines the wick for the high and the low and
 * draws the open and the close on the edges of the body
 * (`CandlestickSelector`).
 *
 * The core pairs the n-th wick with the n-th candle, so the wicks are stamped
 * in the candles' order. A wick selector matching another number of lines
 * than there are candles would mark another candle's prices, and is left out.
 *
 * @param root - The extraction root
 * @param selector - The bodies' selector
 * @param wickSelector - The wicks' selector, when the chart names one
 * @param bodies - The bodies, in the order the candles are listed
 * @param panel - Optional panel scope for multi-panel binds
 * @returns The selectors to emit
 */
function candleSelectors(
  root: Element,
  selector: string,
  wickSelector: string | undefined,
  bodies: { datum: unknown }[],
  panel?: D3PanelScope,
): string | CandlestickSelector {
  const body = scopeSelector(root, selector, panel);
  if (wickSelector === undefined) {
    return body;
  }

  const wicks = queryD3Elements(root, wickSelector);
  if (wicks.length !== bodies.length) {
    console.warn(
      `[maidr/d3] "${wickSelector}" matched ${wicks.length} wicks for `
      + `${bodies.length} candles, so each candle's high and low are outlined `
      + `on its body. Name one wick per candle.`,
    );
    return body;
  }

  return {
    body,
    wick: stampOrderedSelectors(root, wickSelector, WICK_ATTRIBUTE, wicksInCandleOrder(bodies, wicks), panel),
  };
}

/**
 * The wicks, in the order the candles are listed.
 *
 * A wick drawn by a join over the same rows as the bodies is bound to its
 * candle's row, whichever order the two joins put their marks in, so each
 * wick goes with the candle whose row it carries. Wicks bound to other rows,
 * copies of them or none at all, go in the order they are drawn.
 *
 * @param bodies - The bodies, in the order the candles are listed
 * @param wicks - The wicks, one per candle, in the order they are drawn
 * @returns The wick elements, one per candle
 */
function wicksInCandleOrder(
  bodies: { datum: unknown }[],
  wicks: { element: Element; datum: unknown }[],
): Element[] {
  const byRow = bodies.map(({ datum }) => wicks.filter(wick => wick.datum === datum));
  return byRow.every(found => found.length === 1)
    ? byRow.map(([found]) => found.element)
    : wicks.map(wick => wick.element);
}
