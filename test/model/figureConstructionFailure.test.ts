/**
 * @jest-environment jsdom
 */

/**
 * A figure that fails to construct leaves the chart as it found it.
 *
 * `Subplot` builds its traces eagerly and `Figure` its subplots, and every
 * trace constructor inserts MAIDR-owned hidden clones into the SVG as it
 * resolves its selectors. A layer whose `type` is unregistered makes
 * `TraceFactory.create` throw part-way through, so the figure never finishes
 * constructing and nothing ever calls `dispose()` on the pieces built before
 * it -- their clones were orphaned in the chart, and on the live-data path
 * (`Context.replaceFigure`) every failed update added another set.
 */

import type { Maidr, MaidrLayer, MaidrSubplot, TraceType } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { Figure, Subplot } from '@model/plot';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** How many MAIDR-owned elements the document holds right now. */
function ownedCount(): number {
  return document.querySelectorAll('[data-maidr-owned]').length;
}

/** Renders two bars under `#bars` so a valid selector has something to match. */
function renderBars(): void {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  const group = document.createElementNS(SVG_NAMESPACE, 'g');
  group.setAttribute('id', 'bars');
  group.appendChild(document.createElementNS(SVG_NAMESPACE, 'rect'));
  group.appendChild(document.createElementNS(SVG_NAMESPACE, 'rect'));
  svg.appendChild(group);
  document.body.appendChild(svg);
}

/**
 * A bar layer over the two rendered bars.
 * @param type What the layer declares itself as; the grammar's `TraceType`
 *   for a layer the factory accepts, anything else for one it rejects
 * @returns The layer
 */
function barLayer(type: string): MaidrLayer {
  return {
    id: `layer-${type}`,
    type: type as TraceType,
    selectors: '#bars > rect',
    data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
  };
}

describe('a figure that fails to construct', () => {
  beforeEach(renderBars);

  test('a subplot disposes the traces built before the layer that threw', () => {
    const subplot: MaidrSubplot = {
      layers: [barLayer('bar'), barLayer('not-a-chart')],
    };

    expect(() => new Subplot(subplot)).toThrow(/Invalid trace type/);

    expect(ownedCount()).toBe(0);
  });

  test('a figure disposes the subplots built before the one that threw', () => {
    const maidr: Maidr = {
      id: 'partial',
      subplots: [
        [{ selector: '#bars', layers: [barLayer('bar')] }],
        [{ layers: [barLayer('not-a-chart')] }],
      ],
    };

    expect(() => new Figure(maidr)).toThrow(/Invalid trace type/);

    expect(ownedCount()).toBe(0);
  });
});
