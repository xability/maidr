/**
 * @jest-environment jsdom
 *
 * The Recharts Manhattan example read in the order it is drawn.
 *
 * The core walks a Manhattan plot's points left to right by `x`, pairs each
 * with its mark in that order and pans it by it. The example's `xKey` named
 * the position within each chromosome, which starts again at every one, while
 * the chart plots the chromosomes end to end: Right walked the SNPs of
 * chromosomes 2, 1, 3, 2, 3 and 1 in turn, with the stereo position and the
 * order the description listed them in going the same way. Its `xKey` is now
 * the position the chart plots.
 *
 * `<Maidr>` is stood in for so the layer `<MaidrRecharts>` hands it can be
 * read; the chart itself is drawn.
 */

import type { Maidr as MaidrData, VolcanoPoint } from '@type/grammar';
import type { ReactNode } from 'react';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { ManhattanPlotExample } from '../../../examples/recharts/examples/ManhattanPlotExample';

const seen: MaidrData[] = [];

jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    return children;
  },
}));

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
});

afterAll(() => {
  cleanup();
});

describe('the Recharts Manhattan example', () => {
  it('reads its SNPs chromosome by chromosome, left to right as they are drawn', () => {
    render(createElement(ManhattanPlotExample));
    const layer = seen.at(-1)?.subplots[0][0].layers[0];

    const points = (layer?.data ?? []) as VolcanoPoint[];
    const readingOrder = [...points].sort((a, b) => a.x - b.x);

    expect(readingOrder.map(point => point.group)).toEqual(['1', '1', '2', '2', '3', '3']);
    expect(readingOrder.map(point => point.label)).toEqual([
      'rs1042522',
      'rs2234693',
      'rs1801133',
      'rs4988235',
      'rs6265',
      'rs17822931',
    ]);
  });

  it('names the position it announces after the axis that plots it', () => {
    render(createElement(ManhattanPlotExample));

    expect(seen.at(-1)?.subplots[0][0].layers[0].axes?.x?.label).toBe('Genomic position (Mb)');
  });
});
