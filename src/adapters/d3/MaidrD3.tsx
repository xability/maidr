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
 * **Important — remount behavior:** swapping from the bare render to the
 * `<Maidr>`-wrapped render causes the children (including your SVG) to
 * unmount and remount. Make sure your D3 drawing effect re-runs on mount —
 * the typical pattern of running it in `useEffect` with `[data]` deps is
 * sufficient, because a fresh mount triggers all mount effects.
 *
 * @example
 * ```tsx
 * import { useRef, useEffect } from 'react';
 * import { MaidrD3 } from 'maidr/react';
 *
 * function AccessibleBarChart({ data }) {
 *   const svgRef = useRef<SVGSVGElement>(null);
 *
 *   useEffect(() => {
 *     if (!svgRef.current) return;
 *     // ... D3 drawing code into svgRef.current ...
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
 *       <svg ref={svgRef} width={600} height={400} />
 *     </MaidrD3>
 *   );
 * }
 * ```
 */

import type { JSX, ReactNode, RefObject } from 'react';
import type { D3AdapterSpec } from './useD3Adapter';
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
  const { svgRef, children, deps } = props;

  // Reconstruct the discriminated union so `useD3Adapter` sees a correlated
  // `{ chartType, config }` pair. TS can't statically preserve the
  // correlation through destructure/spread, so we narrow with a switch.
  const spec: D3AdapterSpec = buildSpec(props);

  const { maidrData } = useD3Adapter(svgRef, spec, deps);

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
  }
}
