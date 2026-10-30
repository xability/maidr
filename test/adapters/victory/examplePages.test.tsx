/**
 * @jest-environment jsdom
 *
 * The Victory example app's multi-panel figure, rendered, and the grid of
 * panels MAIDR is handed for it.
 *
 * A `<VictoryChart>` is a block, so charts the page does not place side by
 * side stand one below the other, and the figure's panels are a column. The
 * adapter makes the panels one row unless told otherwise, so the example
 * declared a row for a drawing that is a column: Right moved down the page to
 * the next panel, and Down answered "No more subplots".
 */

import type { Maidr as MaidrData } from '@type/grammar';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { MultiPanelExample } from '../../../examples/victory/examples/MultiPanelExample';

const seen: MaidrData[] = [];

// The payload the example hands `<Maidr>`, kept rather than bound.
jest.mock('../../../src/maidr-component', () => ({
  Maidr: ({ data, children }: { data: MaidrData; children: ReactNode }): ReactNode => {
    seen.push(data);
    return children;
  },
}));

afterEach(() => {
  cleanup();
  seen.length = 0;
});

describe('the victory example app', () => {
  it('declares the multi-panel figure a column, as its charts are drawn', async () => {
    await act(async () => {
      render(createElement(MultiPanelExample));
    });
    const figure = seen.at(-1);

    const grid = figure?.subplots.map(row => row.map(subplot => subplot.layers[0]?.title));

    expect(grid).toEqual([['North Region'], ['South Region'], ['Combined Trend']]);
  });
});
