/**
 * Convenience React wrapper that pairs a D3-rendered SVG with `<Maidr>`.
 *
 * Encapsulates the two-step dance required for D3:
 *   1. Wait for the SVG to be committed to the DOM and drawn by D3.
 *   2. Run the appropriate binder to extract the MAIDR schema.
 *   3. Wrap the same children in `<Maidr>` once the schema is available.
 *
 * Before binding completes (on first mount or when `deps` change and the SVG
 * is momentarily empty), the component renders children bare so D3 has a
 * stable SVG to draw into. Once `maidrData` is available, the children are
 * re-rendered inside `<Maidr>` to enable audio sonification, text
 * descriptions, braille output, and keyboard navigation.
 *
 * **Important — draw D3 in a ref callback, not a `useEffect`.** `MaidrD3` is
 * the *parent* of your `<svg>`, so its binder effect (inside `useD3Adapter`)
 * runs *before* any `useEffect` in the component that owns the ref. A
 * `useEffect(..., [data])` draw would therefore run *after* the binder, which
 * sees an empty SVG and throws "No elements found …". Additionally, the swap
 * from the bare render to the `<Maidr>`-wrapped render remounts the `<svg>`,
 * and a still-mounted owner component's `useEffect` does **not** re-fire on a
 * host-element remount — so the redraw never happens and the chart blanks.
 *
 * Draw inside a **ref callback** instead: it runs during React's commit phase
 * (before any effect, so the binder sees a populated SVG) *and* re-fires when
 * the SVG remounts (so the chart survives the `<Maidr>` swap). See
 * `examples/react-app/D3BarExample.tsx` for a complete example.
 *
 * @example
 * ```tsx
 * import { useCallback, useRef } from 'react';
 * import { MaidrD3 } from 'maidr/react';
 *
 * function AccessibleBarChart({ data }) {
 *   const svgRef = useRef<SVGSVGElement>(null);
 *
 *   // Draw in a ref callback: it runs in the commit phase (before MaidrD3's
 *   // binder effect) and re-runs when the SVG remounts on the <Maidr> swap.
 *   const attachSvg = useCallback((node: SVGSVGElement | null) => {
 *     svgRef.current = node;
 *     if (!node) return;
 *     // ... D3 drawing code into `node` ...
 *   }, [data]);
 *
 *   return (
 *     <MaidrD3
 *       svgRef={svgRef}
 *       chartType="bar"
 *       config={{
 *         selector: 'rect.bar',
 *         title: 'Sales',
 *         axes: { x: 'Quarter', y: 'Revenue' },
 *       }}
 *       deps={[data]}
 *     >
 *       <svg ref={attachSvg} width={600} height={400} />
 *     </MaidrD3>
 *   );
 * }
 * ```
 */

import type { JSX, ReactNode, RefObject } from 'react';
import type { D3AdapterSpec } from './useD3Adapter';
import { useEffect, useRef } from 'react';
import { Maidr } from '../../maidr-component';
import { useD3Adapter } from './useD3Adapter';

/**
 * Props for the {@link MaidrD3} wrapper component.
 *
 * The `chartType` field is a discriminator that narrows `config` to the
 * correct binder-specific type at the call site.
 */
export type MaidrD3Props = D3AdapterSpec & {
  /**
   * Ref to the SVG element that D3 draws into. The same ref must be
   * attached to the `<svg>` inside `children` so the binder can read it.
   */
  svgRef: RefObject<SVGElement | null>;
  /**
   * React dependency list that triggers re-binding. Include anything that
   * changes the D3 chart's data or DOM. Defaults to `[]` (bind once).
   */
  deps?: React.DependencyList;
  /**
   * Optional callback invoked when the binder throws (e.g. the selector
   * matched no elements, or the SVG was not yet drawn). Fires once per
   * failed bind. The error is also logged via `console.error` regardless.
   * When the next bind succeeds, the callback is **not** invoked — consumers
   * tracking error UI should clear it on their own (e.g. via the dependency
   * that triggers re-binding).
   */
  onError?: (error: Error) => void;
  /** The rendered SVG (and any siblings) to make accessible. */
  children: ReactNode;
};

/**
 * Wrapper component that binds a D3.js chart to MAIDR.
 *
 * See the module-level JSDoc for the timing contract and the typical
 * usage pattern with `useRef` + a D3 drawing effect.
 */
export function MaidrD3(props: MaidrD3Props): JSX.Element {
  const { svgRef, children, deps, onError } = props;

  // Reconstruct the discriminated union so `useD3Adapter` sees a correlated
  // `{ chartType, config }` pair. TS can't statically preserve the
  // correlation through destructure/spread, so we narrow with a switch.
  const spec: D3AdapterSpec = buildSpec(props);

  const { maidrData, error } = useD3Adapter(svgRef, spec, deps);

  // Keep the latest `onError` in a ref so the effect can call it without
  // depending on its identity. With a common inline-arrow prop, `onError`
  // changes every parent render; listing it as a dependency would re-fire the
  // callback while `error` stays non-null (and risk a render loop). Depending
  // only on `error` — a stable React-state reference until the next bind —
  // preserves the documented "fires once per failed bind" contract.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (error) {
      onErrorRef.current?.(error);
    }
  }, [error]);

  // Render children bare until the first successful bind. This lets D3
  // draw into `svgRef.current` before we wrap with <Maidr>.
  if (!maidrData) {
    return <>{children}</>;
  }

  return (
    <Maidr data={maidrData}>
      {children}
    </Maidr>
  );
}

/**
 * Narrows the {@link MaidrD3Props} discriminated union back to an
 * {@link D3AdapterSpec} without losing the `chartType` ↔ `config` correlation.
 */
function buildSpec(props: MaidrD3Props): D3AdapterSpec {
  switch (props.chartType) {
    case 'bar':
      return { chartType: 'bar', config: props.config };
    case 'box':
      return { chartType: 'box', config: props.config };
    case 'candlestick':
      return { chartType: 'candlestick', config: props.config };
    case 'heatmap':
      return { chartType: 'heatmap', config: props.config };
    case 'histogram':
      return { chartType: 'histogram', config: props.config };
    case 'line':
      return { chartType: 'line', config: props.config };
    case 'scatter':
      return { chartType: 'scatter', config: props.config };
    case 'segmented':
      return { chartType: 'segmented', config: props.config };
    case 'smooth':
      return { chartType: 'smooth', config: props.config };
    case 'facets':
      return { chartType: 'facets', config: props.config };
    case 'subplots':
      return { chartType: 'subplots', config: props.config };
  }
}
