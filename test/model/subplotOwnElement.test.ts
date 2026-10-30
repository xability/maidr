/**
 * @jest-environment jsdom
 */

import type { Maidr, MaidrSubplot } from '@type/grammar';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Figure } from '@model/plot';
import { TraceType } from '@type/grammar';
import { resolveSubplotLayout } from '@util/subplotLayout';

/**
 * A subplot's own `selector` names its panel, which the lobby outlines. It
 * used to be resolved to a hidden copy of the panel, inserted beside it. A
 * copy of a group inside an `<svg>` takes no room, but Victory names each
 * panel by its own root `<svg>`, an element of the page's flow: each hidden
 * copy kept the room the panel takes, so focusing the figure put a blank the
 * height of each panel under it, the figure grew to three times its size, and
 * the panel being read scrolled out of view.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Puts two panels on the page as Victory draws them: one `<svg>` each, in a
 * wrapper of its own.
 * @returns The panels' root elements, in order
 */
function drawVictoryPanels(): SVGElement[] {
  document.body.innerHTML = [0, 1].map(index =>
    `<div class="VictoryContainer"><svg xmlns="${SVG_NAMESPACE}" role="img" data-panel="${index}">`
    + `<rect class="bar"/><rect class="bar"/></svg></div>`).join('');
  return Array.from(document.querySelectorAll<SVGElement>('svg'));
}

/**
 * Two bar panels, each named by its root `<svg>`.
 * @returns The figure's data
 */
function twoPanels(): Maidr {
  const panel = (index: number): MaidrSubplot => ({
    selector: `svg[data-panel="${index}"]`,
    layers: [{
      id: String(index),
      type: TraceType.BAR,
      data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }],
    }],
  });
  return { id: 'victory-panels', subplots: [[panel(0)], [panel(1)]] } as Maidr;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a subplot named by its own selector', () => {
  it('is the element the chart drew, with no copy of it added to the page', () => {
    const panels = drawVictoryPanels();

    const figure = new Figure(twoPanels());
    figure.applyLayout(resolveSubplotLayout(figure.subplots));

    expect(figure.subplots.map(row => row[0].getHighlightElement())).toEqual(panels);
    expect(document.querySelectorAll('svg')).toHaveLength(2);
    expect(document.querySelectorAll('[data-maidr-owned]')).toHaveLength(0);
    figure.dispose();
  });

  it('is what the lobby outlines', () => {
    const panels = drawVictoryPanels();

    const figure = new Figure(twoPanels());
    figure.applyLayout(resolveSubplotLayout(figure.subplots));

    expect(figure.subplots.map(row => row[0].panelElement)).toEqual(panels);
    figure.dispose();
  });

  it('is left on the page when the figure is disposed', () => {
    const panels = drawVictoryPanels();
    const figure = new Figure(twoPanels());
    figure.applyLayout(resolveSubplotLayout(figure.subplots));

    figure.dispose();

    expect(panels.every(panel => panel.isConnected)).toBe(true);
  });
});
