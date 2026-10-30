/**
 * @jest-environment jsdom
 *
 * An amCharts figure of several panels draws them all on canvases, so in the
 * figure lobby nothing in the page marks the panel the reader is on for MAIDR
 * to outline. MAIDR names the panel to the binder beside the `null` that ends
 * the selection, and the binder outlines that panel's plot area itself.
 */

import type { AmBounds, AmRoot } from '@adapters/amcharts/types';
import type { BarPoint, Maidr } from '@type/grammar';
import type { ReactNode } from 'react';
import { bindAmCharts } from '@adapters/amcharts/binder';
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

beforeEach(() => {
  renders.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
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

const TOP: AmBounds = { left: 40, top: 10, right: 440, bottom: 200 };
const BOTTOM: AmBounds = { left: 40, top: 220, right: 440, bottom: 410 };

describe('the amCharts figure lobby', () => {
  it('outlines the plot area of the panel the lobby is on', async () => {
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    const top = fakeChart({ bounds: TOP, series: [fakeBarSeries('Top', [{ categoryX: 'a', valueY: 1 }])] });
    const bottom = fakeChart({ bounds: BOTTOM, series: [fakeBarSeries('Bottom', [{ categoryX: 'a', valueY: 2 }])] });
    const root = { dom, container: { children: { values: [top, bottom] } } } as unknown as AmRoot;

    let binding: ReturnType<typeof bindAmCharts> | undefined;
    act(() => {
      binding = bindAmCharts(root);
    });
    await settle();
    const show = jest.spyOn(HighlightOverlay.prototype, 'show');
    const data = renders[renders.length - 1];
    // The bottom panel is the one whose bar reads 2.
    const layers = data.subplots.flat().map(subplot => subplot.layers[0]);
    const ids = layers.filter(layer => (layer.data as BarPoint[])[0].y === 2).map(layer => layer.id);
    expect(ids).toHaveLength(1);

    act(() => data.onNavigate?.(null, { layerIds: ids }));

    expect(show).toHaveBeenLastCalledWith([{ left: 40, top: 220, width: 400, height: 190 }]);
    binding?.dispose();
  });

  it('outlines nothing when no panel is named', async () => {
    const dom = document.createElement('div');
    document.body.appendChild(dom);
    const chart = fakeChart({ bounds: TOP, series: [fakeBarSeries('A', [{ categoryX: 'a', valueY: 1 }])] });
    const root = { dom, container: { children: { values: [chart] } } } as unknown as AmRoot;

    let binding: ReturnType<typeof bindAmCharts> | undefined;
    act(() => {
      binding = bindAmCharts(root);
    });
    await settle();
    const show = jest.spyOn(HighlightOverlay.prototype, 'show');

    act(() => renders[renders.length - 1].onNavigate?.(null));

    expect(show).not.toHaveBeenCalled();
    binding?.dispose();
  });
});
