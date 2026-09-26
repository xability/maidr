/**
 * React hook that converts an MUI X chart into MAIDR data.
 *
 * MUI X Charts are configured entirely through props -- `series`, `xAxis`,
 * `yAxis`, `dataset`, `layout` -- so this hook reads those off the chart
 * element among `children` rather than asking for the data a second time. The
 * rendered marks are found through the `data-series` attribute and class
 * names MUI stamps on them, scoped to the container `containerRef` points at,
 * so nothing in the chart's SVG is modified.
 *
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { Maidr } from 'maidr/react';
 * import { useMuiChartsAdapter } from 'maidr/mui-x-charts';
 * import { BarChart } from '@mui/x-charts/BarChart';
 *
 * function AccessibleChart() {
 *   const containerRef = useRef<HTMLDivElement>(null);
 *   const children = (
 *     <BarChart
 *       width={500}
 *       height={300}
 *       xAxis={[{ data: ['Q1', 'Q2', 'Q3'], label: 'Quarter' }]}
 *       series={[{ data: [120, 200, 150], label: 'Revenue' }]}
 *     />
 *   );
 *   const maidrData = useMuiChartsAdapter({ id: 'sales', title: 'Sales', children }, containerRef);
 *
 *   return (
 *     <Maidr data={maidrData}>
 *       <div ref={containerRef}>{children}</div>
 *     </Maidr>
 *   );
 * }
 * ```
 */

import type { Maidr as MaidrData } from '@type/grammar';
import type { RefObject } from 'react';
import type { MuiChartKind, MuiChartsAdapterConfig } from './types';
import { cssEscape, ensureContainerId } from '@adapters/shared/selectorUtil';
import { useLayoutEffect, useRef, useState } from 'react';
import { convertMuiChartsToMaidr, findMuiChartElement, warnOnce } from './converters';
import { KIND_ROOT_CLASSES } from './selectors';

/**
 * Reads the chart kind off the classes MUI stamps on the rendered plot.
 *
 * @param container - The element wrapping the rendered chart
 * @returns The kind, or `undefined` while nothing recognisable is drawn
 */
export function detectMuiChartKind(container: Element): MuiChartKind | undefined {
  for (const [kind, className] of KIND_ROOT_CLASSES) {
    if (container.querySelector(`.${className}`))
      return kind;
  }
  return undefined;
}

/**
 * Converts the MUI X chart among `config.children` into MAIDR data.
 *
 * @param config       - Chart metadata and the MUI X chart to introspect
 * @param containerRef - Ref to the DOM node wrapping the rendered chart
 * @returns MaidrData ready to pass to `<Maidr data={...}>`
 */
export function useMuiChartsAdapter(
  config: MuiChartsAdapterConfig,
  containerRef: RefObject<HTMLDivElement | null>,
): MaidrData {
  const { id, title, subtitle, caption, children, chartType } = config;
  const fingerprintRef = useRef('');
  const [maidrData, setMaidrData] = useState<MaidrData>(() => ({
    id,
    title,
    subtitle,
    caption,
    subplots: [[{ layers: [] }]],
  }));

  // A layout effect so the container exists and carries its id before the
  // payload is built: every selector is prefixed with that id, which keeps
  // two charts on one page from highlighting each other's marks (the model
  // resolves selectors with page-global `document.querySelectorAll`).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container)
      return;
    const scope = `#${cssEscape(ensureContainerId(container, 'mui'))} `;
    const chart = findMuiChartElement(children);
    // MAIDR's plot is as wide as its content, and a chart with no `width`
    // takes the width of its container: the two size each other down to a
    // sliver. A fixed width breaks the circle.
    if (chart && typeof chart.props.width !== 'number') {
      warnOnce(
        'give the chart a `width` prop. Without one it sizes itself to its container, which '
        + 'inside MAIDR\'s plot is only as wide as the chart, and it collapses.',
      );
    }

    const apply = (): boolean => {
      const kind = chartType ?? chart?.kind ?? detectMuiChartKind(container);
      const data = convertMuiChartsToMaidr({ id, title, subtitle, caption }, kind, chart?.props, scope);
      // `children` is a new object on every parent render, so the effect
      // re-runs often; only a payload that actually changed is published, or
      // every render would rebuild the MAIDR model.
      const fingerprint = JSON.stringify(data);
      if (fingerprint !== fingerprintRef.current) {
        fingerprintRef.current = fingerprint;
        setMaidrData(data);
      }
      return kind !== undefined;
    };

    if (apply() || !chart)
      return;

    // The component name did not say which chart this is (a minifier renamed
    // it) and the plot is not drawn yet -- a responsive chart waits for its
    // container to be measured. Try again as the SVG fills in.
    const observer = new MutationObserver(() => {
      if (apply())
        observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [children, chartType, id, title, subtitle, caption, containerRef]);

  return maidrData;
}
