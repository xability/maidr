/**
 * @jest-environment jsdom
 */

/**
 * The panel outline `HighlightService` draws reads two things from the page:
 * how many panels the chart has, which decides whether a panel is outlined at
 * all, and py-maidr's figure background, which the outline's colour is
 * measured against when a panel is transparent. Both used to be read from
 * the whole page, so on a page of several charts a single-panel chart counted
 * its neighbours' panels, and a figure measured its outline against the first
 * chart's background. Each chart is read inside the elements it is drawn in
 * now, the same ones its layout counts panels in.
 */

import type { SettingsService } from '@service/settings';
import type { SubplotState, TraceState } from '@type/state';
import { afterEach, describe, expect, it } from '@jest/globals';
import { HighlightService } from '@service/highlight';
import { DEFAULT_SETTINGS } from '@type/settings';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * A settings service that answers with the defaults and never changes.
 * @returns The stand-in
 */
function settingsStub(): SettingsService {
  const stub: Pick<SettingsService, 'loadSettings' | 'onChange'> = {
    loadSettings: () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS,
    onChange: () => ({ dispose: () => {} }),
  };
  return stub as SettingsService;
}

/**
 * Adds one chart to the page as py-maidr draws it: a figure group holding the
 * figure background, then one transparent group per panel.
 * @param name - What makes the chart's ids its own
 * @param panels - How many panels it has
 * @param background - The figure background's fill
 * @returns The chart's plot element
 */
function addChart(name: string, panels: number, background: string): HTMLElement {
  const plot = document.createElement('div');
  const axes = Array.from({ length: panels }, (_, i) =>
    `<g id="axes_${i + 1}-${name}"><path style="fill: none"/></g>`).join('');
  plot.innerHTML = `<svg xmlns="${SVG_NAMESPACE}"><g id="figure_1-${name}">`
    + `<g id="maidr-figure-${name}"><path style="fill: ${background}"/></g>${axes}</g></svg>`;
  document.body.appendChild(plot);
  return plot;
}

/**
 * The state of a subplot whose outline is the given panel.
 * @param panel - The panel's group
 * @returns The state
 */
function onPanel(panel: SVGElement): SubplotState {
  return {
    empty: false,
    type: 'subplot',
    size: 1,
    index: 1,
    trace: {} as TraceState,
    highlight: { empty: false, elements: panel },
  };
}

/**
 * Moves onto the first panel of a chart and reads the outline drawn there.
 * @param plot - The chart's plot element
 * @param overlays - The chart's layers drawn outside its plot element
 * @returns The outline's stroke, or null when the panel is not outlined
 */
function outlineOfFirstPanel(plot: HTMLElement, overlays: Element[] = []): string | null {
  const service = new HighlightService(settingsStub(), () => [plot, ...overlays]);
  const panel = plot.querySelector('g[id^="axes_"]') as SVGElement;

  service.update(onPanel(panel));

  const background = panel.querySelector('path') as SVGElement;
  const stroke = background.hasAttribute('data-maidr-orig-stroke') ? background.getAttribute('stroke') : null;
  service.dispose();
  return stroke;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('HighlightService beside another chart', () => {
  it('should not outline the only panel of a chart that follows another', () => {
    addChart('mA', 1, '#ffffff');
    const plot = addChart('mB', 1, '#ffffff');

    const stroke = outlineOfFirstPanel(plot);

    expect(stroke).toBeNull();
  });

  it('should outline a panel of a chart that has two', () => {
    addChart('mA', 1, '#ffffff');
    const plot = addChart('mB', 2, '#ffffff');

    const stroke = outlineOfFirstPanel(plot);

    expect(stroke).not.toBeNull();
  });

  it('should measure the outline against the chart\'s own figure background', () => {
    const alone = outlineOfFirstPanel(addChart('mB', 2, '#ffffff'));
    document.body.innerHTML = '';
    addChart('mA', 1, '#000000');
    const plot = addChart('mB', 2, '#ffffff');

    const beside = outlineOfFirstPanel(plot);

    expect(beside).not.toBeNull();
    expect(beside).toBe(alone);
  });

  it('should count the panels in every element the chart is drawn in', () => {
    const plot = addChart('mB', 1, '#ffffff');
    const overlay = document.createElementNS(SVG_NAMESPACE, 'svg');
    overlay.innerHTML = '<g id="axes_2-mB"><path style="fill: none"/></g>';
    document.body.appendChild(overlay);

    const stroke = outlineOfFirstPanel(plot, [overlay]);

    expect(stroke).not.toBeNull();
  });
});
