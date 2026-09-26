/**
 * Public Nivo adapter API for MAIDR.
 *
 * Provides a `<MaidrNivo>` wrapper component, a `useNivoAdapter` hook and a
 * pure `nivoToMaidr` converter for making Nivo charts accessible through
 * MAIDR's audio sonification, text descriptions, braille output, and keyboard
 * navigation.
 *
 * @remarks
 * Requires React 18 or 19. The adapter never imports a `@nivo/*` package: it
 * reads the props the chart is rendered with, so the chart kind is declared
 * with `type`. Highlighting uses the `data-testid`/`data-key` attributes Nivo
 * stamps on its SVG marks, and tags line and scatter marks with
 * `data-maidr-nivo-*` attributes after render.
 *
 * Supported chart kinds (SVG components; the `*Canvas` variants are read but
 * not highlighted):
 * - `'bar'` → `@nivo/bar`: bar, stacked bar, grouped (dodged) bar, and
 *   `layout="horizontal"` for each
 * - `'line'` → `@nivo/line`: line chart (step chart for the step curves)
 * - `'scatterplot'` → `@nivo/scatterplot`: one scatter layer per series
 * - `'pie'` → `@nivo/pie`: pie chart (a doughnut with `innerRadius`)
 * - `'heatmap'` → `@nivo/heatmap`: heat map
 * - `'boxplot'` → `@nivo/boxplot`: box plot, vertical or horizontal
 *
 * @example Using the wrapper component
 * ```tsx
 * import { MaidrNivo } from 'maidr/nivo';
 * import { Bar } from '@nivo/bar';
 *
 * function AccessibleChart() {
 *   return (
 *     <MaidrNivo id="revenue" title="Revenue by Quarter" type="bar">
 *       <Bar
 *         width={600}
 *         height={400}
 *         data={[
 *           { quarter: 'Q1', revenue: 120 },
 *           { quarter: 'Q2', revenue: 200 },
 *         ]}
 *         keys={['revenue']}
 *         indexBy="quarter"
 *         axisBottom={{ legend: 'Quarter' }}
 *         axisLeft={{ legend: 'Revenue ($)' }}
 *       />
 *     </MaidrNivo>
 *   );
 * }
 * ```
 *
 * @example Using the hook with `<Maidr>`
 * ```tsx
 * import { useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useNivoAdapter } from 'maidr/nivo';
 * import { Line } from '@nivo/line';
 *
 * function AccessibleLineChart() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const props = { width: 600, height: 400, data: [{ id: 'trend', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }] };
 *   const maidrData = useNivoAdapter({ id: 'trend', title: 'Trend', type: 'line', props }, containerRef);
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <div ref={containerRef}><Line {...props} /></div>
 *     </Maidr>
 *   );
 * }
 * ```
 *
 * @packageDocumentation
 */

export {
  extractNivoLayers,
  MaidrNivo,
  nivoToMaidr,
  toMaidrLayer,
  useNivoAdapter,
} from './adapters/nivo';

export type {
  MaidrNivoProps,
  NivoAdapterConfig,
  NivoChartType,
  NivoLayerData,
  NivoLayerInfo,
  NivoMarks,
} from './adapters/nivo';

// Re-export core types that consumers may need alongside the adapter.
export type { Maidr as MaidrData, MaidrLayer, MaidrSubplot } from './type/grammar';
export { Orientation, TraceType } from './type/grammar';
