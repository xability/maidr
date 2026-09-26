/**
 * @jest-environment jsdom
 *
 * The hook mounted over a live MUI X chart: the container gets an id, the
 * payload's selectors are scoped to it, and they resolve in the document the
 * way the model resolves them on focus -- with page-global
 * `document.querySelectorAll`.
 */

import type { MuiChartsAdapterConfig } from '@adapters/mui-x-charts/types';
import type { Maidr as MaidrData } from '@type/grammar';
import type { JSX } from 'react';
import { useMuiChartsAdapter } from '@adapters/mui-x-charts/useMuiChartsAdapter';
import { describe, expect, it } from '@jest/globals';
import { BarChart } from '@mui/x-charts/BarChart';
import { render } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { useRef } from 'react';

// MUI X's gesture layer clones its config with `structuredClone`, which the
// jsdom environment does not expose although Node itself has it.
if (typeof globalThis.structuredClone !== 'function')
  globalThis.structuredClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

let latest: MaidrData | undefined;

function Harness(config: MuiChartsAdapterConfig): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  latest = useMuiChartsAdapter(config, ref);
  return <div ref={ref}>{config.children}</div>;
}

const chart = (
  <BarChart
    width={400}
    height={300}
    skipAnimation
    xAxis={[{ scaleType: 'band', data: ['Q1', 'Q2', 'Q3'], label: 'Quarter' }]}
    series={[{ data: [3, 5, 2], label: 'Revenue' }]}
  />
);

describe('useMuiChartsAdapter', () => {
  it('scopes selectors to its own container and resolves them in the live document', () => {
    const { container } = render(<Harness id="rev" title="Revenue">{chart}</Harness>);
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.id).not.toBe('');
    const layer = latest!.subplots[0][0].layers[0];
    expect(latest!.title).toBe('Revenue');
    expect(layer.type).toBe(TraceType.BAR);
    expect(layer.selectors as string).toContain(`#${wrapper.id} `);
    expect(document.querySelectorAll(layer.selectors as string)).toHaveLength(3);
  });

  it('keeps two charts on one page from matching each other\'s marks', () => {
    render(
      <>
        <Harness id="a">{chart}</Harness>
      </>,
    );
    const first = latest!.subplots[0][0].layers[0].selectors as string;
    render(<Harness id="b">{chart}</Harness>);
    const second = latest!.subplots[0][0].layers[0].selectors as string;

    expect(first).not.toBe(second);
    expect(document.querySelectorAll(first)).toHaveLength(3);
    expect(document.querySelectorAll(second)).toHaveLength(3);
  });

  it('honours an explicit chartType', () => {
    render(<Harness id="c" chartType="bar">{chart}</Harness>);
    expect(latest!.subplots[0][0].layers[0].type).toBe(TraceType.BAR);
  });
});
