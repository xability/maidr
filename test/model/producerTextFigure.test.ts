/**
 * @jest-environment jsdom
 */

/**
 * A chart whose layer title is not text still reads its title.
 *
 * r-maidr wrote a ggplot2 box plot's missing layer title as `"title": {}`,
 * and building the chart's description called `.trim()` on it and threw: the
 * `d` key opened nothing. The figure now reads such a title as absent, so the
 * trace has the placeholder every untitled layer has and the description
 * falls back to the figure's title.
 */

import type { Maidr } from '@type/grammar';
import { afterAll, describe, expect, jest, test } from '@jest/globals';
import { DEFAULT_SUBPLOT_TITLE } from '@model/abstract';
import { Figure, isAuthoredTitle } from '@model/plot';
import { TraceType } from '@type/grammar';

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

function boxPlotTitled(layerTitle: unknown): Maidr {
  return {
    id: 'chart',
    title: 'Petal Length by Species',
    subplots: [[{
      layers: [{
        id: '1',
        type: TraceType.BAR,
        title: layerTitle as string,
        data: [{ x: 'setosa', y: 1.5 }, { x: 'virginica', y: 5.5 }],
      }],
    }]],
  };
}

describe('a layer title that is not text', () => {
  test('is read as no title, leaving the figure\'s', () => {
    const figure = new Figure(boxPlotTitled({}));
    const trace = figure.subplots[0][0].activeTrace;
    if (trace === null) {
      throw new Error('the subplot has no trace');
    }
    const state = trace.state;
    const figureState = figure.state;

    expect(state.empty ? null : state.title).toBe(DEFAULT_SUBPLOT_TITLE);
    expect(isAuthoredTitle(state.empty ? '' : state.title)).toBe(false);
    expect(figureState.empty ? null : figureState.title).toBe('Petal Length by Species');

    figure.dispose();
  });
});
