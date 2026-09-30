/**
 * @jest-environment jsdom
 *
 * Focus leaving an amCharts chart clears its highlight, and the next resize
 * of the chart must not draw it back. The binder replays the last position on
 * every resize so the box follows the relaid-out canvas; a position kept past
 * focusout put the box back on a point no reader was on.
 */

import type { AmRoot } from '@adapters/amcharts/types';
import type { Maidr } from '@type/grammar';
import type { ReactNode } from 'react';
import { bindXYChart } from '@adapters/amcharts/binder';
import { HighlightOverlay } from '@adapters/amcharts/overlay';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act } from '@testing-library/react';
import { fakeBarSeries, fakeChart } from './helpers';

/** Every `data` prop the stand-in `<Maidr>` was rendered with. */
const renders: Maidr[] = [];

/**
 * `<Maidr>` stands in for itself, as in the uPlot binder tests: the real
 * component reaches ESM-only modules, and this project compiles to CommonJS.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
    renders.push(props.data);
    return <figure>{props.children}</figure>;
  },
}));

/** The callbacks of every ResizeObserver the binder created. */
let resizeCallbacks: Array<() => void> = [];

beforeEach(() => {
  renders.length = 0;
  resizeCallbacks = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    public constructor(callback: () => void) {
      resizeCallbacks.push(callback);
    }

    public observe(): void {}
    public disconnect(): void {}
  };
});

afterEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('focus leaving an amCharts chart', () => {
  it('does not redraw the highlight on the next resize', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    const parent = document.createElement('div');
    const dom = document.createElement('div');
    dom.id = 'chartdiv';
    parent.appendChild(dom);
    document.body.appendChild(parent);
    const root = { dom, container: { values: [] } } as unknown as AmRoot;
    const chart = fakeChart({ series: [fakeBarSeries('A', [{ categoryX: 'a', valueY: 1 }])] });

    let binding: ReturnType<typeof bindXYChart> | undefined;
    act(() => {
      binding = bindXYChart(chart, root);
    });
    await settle();
    const draws = jest.spyOn(HighlightOverlay.prototype, 'setPlotArea');

    const onNavigate = renders[renders.length - 1].onNavigate!;
    const layerId = renders[renders.length - 1].subplots[0][0].layers[0].id;
    const inside = document.createElement('button');
    dom.appendChild(inside);
    inside.focus();
    act(() => onNavigate({ layerId, row: 0, col: 0 }));
    expect(draws).toHaveBeenCalledTimes(1);

    outside.focus();
    await settle();
    resizeCallbacks.forEach(callback => callback());
    await settle();

    expect(draws).toHaveBeenCalledTimes(1);
    binding?.dispose();
  });
});
