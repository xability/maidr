/**
 * Public React API for MAIDR.
 *
 * Provides the `<Maidr>` component for adding accessible, non-visual access to
 * statistical visualizations in React applications. Supports audio sonification,
 * text descriptions, braille output, and keyboard navigation.
 *
 * @remarks
 * Requires React 18 or 19 as a peer dependency.
 *
 * @example
 * ```tsx
 * import { Maidr, type MaidrData } from 'maidr/react';
 *
 * const data: MaidrData = {
 *   id: 'my-chart',
 *   title: 'Sales by Quarter',
 *   subplots: [[{
 *     layers: [{
 *       id: '0',
 *       type: 'bar',
 *       axes: { x: 'Quarter', y: 'Revenue' },
 *       data: [
 *         { x: 'Q1', y: 120 },
 *         { x: 'Q2', y: 200 },
 *       ],
 *     }],
 *   }]],
 * };
 *
 * function MyChart() {
 *   return (
 *     <Maidr data={data}>
 *       <svg>{...}</svg>
 *     </Maidr>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */
/**
 * D3.js React wrapper and hook.
 *
 * `<MaidrD3>` pairs a D3-rendered SVG with `<Maidr>` so you can drop a
 * D3 chart into a React tree and get MAIDR's accessibility features with
 * minimal wiring. `useD3Adapter` is the lower-level hook if you prefer to
 * compose with `<Maidr>` yourself.
 *
 * @remarks
 * Requires React 18 or 19 as a peer dependency. The vanilla binder
 * functions (`bindD3Bar`, etc.) ship in the separate `maidr/d3` bundle.
 */
export { MaidrD3, type MaidrD3Props } from './adapters/d3/MaidrD3';
export {
  type D3AdapterSpec,
  type D3ChartType,
  useD3Adapter,
  type UseD3AdapterResult,
} from './adapters/d3/useD3Adapter';

export { Maidr, type MaidrProps } from './maidr-component';

/**
 * Re-exported types for constructing the MAIDR data prop.
 * `MaidrData` is the root type passed to `<Maidr data={...}>`.
 */
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';

/**
 * Re-exported enums for specifying plot trace types and orientations.
 */
export { Orientation, TraceType } from './type/grammar';
