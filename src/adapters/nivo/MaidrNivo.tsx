import type { JSX, ReactNode } from 'react';
import type { MaidrNivoProps } from './types';
import { Children, isValidElement, useRef } from 'react';
import { Maidr } from '../../maidr-component';
import { useNivoAdapter } from './useNivoAdapter';

/** Props of an element whose chart could not be found. */
const NO_PROPS: Readonly<Record<string, unknown>> = Object.freeze({});

/**
 * Finds the Nivo chart element among `children` and returns its props.
 *
 * The chart is the first element whose type is a component rather than an
 * HTML tag. Fragments and plain elements around it are looked through, which
 * is what lets a `Responsive*` chart sit in the sized `<div>` it measures:
 * `<MaidrNivo type="bar"><div style={{ height: 400 }}><ResponsiveBar ... /></div></MaidrNivo>`.
 *
 * @param children - What `<MaidrNivo>` was given
 * @returns The chart's props, or undefined when there is no component element
 */
export function findNivoChartProps(children: ReactNode): Readonly<Record<string, unknown>> | undefined {
  let found: Readonly<Record<string, unknown>> | undefined;
  Children.forEach(children, (child) => {
    if (found || !isValidElement(child))
      return;
    const props = child.props as Record<string, unknown>;
    if (typeof child.type === 'string' || typeof child.type === 'symbol')
      found = findNivoChartProps(props.children as ReactNode);
    else
      found = props;
  });
  return found;
}

/**
 * React component that wraps a Nivo chart and provides accessible, non-visual
 * access through MAIDR's audio sonification, text descriptions, braille
 * output, and keyboard navigation.
 *
 * Nivo's components cannot be told apart by their element type, so the chart
 * kind is declared with `type`: `'bar'`, `'line'`, `'scatterplot'`, `'pie'`,
 * `'heatmap'` or `'boxplot'`. The data is read from the child chart's props.
 *
 * A `Responsive*` chart fills its parent, so give it a sized parent inside
 * the wrapper; MAIDR's own wrapper sizes itself to its content.
 *
 * @example
 * ```tsx
 * import { MaidrNivo } from 'maidr/nivo';
 * import { ResponsiveBar } from '@nivo/bar';
 *
 * function AccessibleBarChart() {
 *   return (
 *     <MaidrNivo id="sales" title="Sales by Quarter" type="bar">
 *       <div style={{ width: 600, height: 400 }}>
 *         <ResponsiveBar
 *           data={[
 *             { quarter: 'Q1', sales: 120 },
 *             { quarter: 'Q2', sales: 200 },
 *           ]}
 *           keys={['sales']}
 *           indexBy="quarter"
 *           axisBottom={{ legend: 'Quarter' }}
 *           axisLeft={{ legend: 'Sales ($)' }}
 *         />
 *       </div>
 *     </MaidrNivo>
 *   );
 * }
 * ```
 */
export function MaidrNivo({
  id,
  title,
  subtitle,
  caption,
  type,
  children,
}: MaidrNivoProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const warnedRef = useRef(false);
  const props = findNivoChartProps(children);
  if (!props && !warnedRef.current) {
    warnedRef.current = true;
    console.warn(`MAIDR: <MaidrNivo id="${id}"> found no Nivo chart element among its children.`);
  }
  const maidrData = useNivoAdapter({ id, title, subtitle, caption, type, props: props ?? NO_PROPS }, containerRef);

  return (
    <Maidr data={maidrData}>
      <div ref={containerRef}>
        {children}
      </div>
    </Maidr>
  );
}
