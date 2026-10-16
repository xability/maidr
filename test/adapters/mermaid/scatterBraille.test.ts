/**
 * @jest-environment jsdom
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import type { BrailleState, TraceState } from '@type/state';
import { convertMermaidDiagram } from '@adapters/mermaid/converter';
import { describe, expect, it } from '@jest/globals';
import { ScatterTrace } from '@model/scatter';

/**
 * A quadrant chart's and a Wardley map's `point` layer reach a braille display.
 *
 * A scatter has a braille surface only in grid navigation, and a grid only
 * when its axes declare a min, a max and a step. Both diagrams declared the
 * range alone, so the grid -- and with it the braille -- was never there:
 * <kbd>B</kbd> said braille was not supported for the plot type (#1410).
 *
 * As in `converter.test.ts`, each diagram is a stand-in database shaped as
 * Mermaid's; the e2e spec runs the real Mermaid.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Converts a stand-in database and returns its first layer.
 *
 * @param type - The diagram type
 * @param db - The database
 * @returns The first layer
 */
function firstLayer(type: string, db: object): MaidrLayer {
  document.body.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.id = 'd';
  document.body.appendChild(svg);
  const figure: Maidr = convertMermaidDiagram({ type, db }, svg);
  return figure.subplots[0][0].layers[0];
}

/**
 * The braille state of a layer's trace once the rotor has put it in grid mode.
 *
 * @param layer - The layer
 * @returns The trace's braille state
 */
function gridBraille(layer: MaidrLayer): BrailleState {
  const trace = new ScatterTrace(layer);
  expect(trace.supportsGridMode()).toBe(true);
  trace.setGridMode(true);
  trace.moveOnce('FORWARD');
  return (trace.state as Extract<TraceState, { empty: false }>).braille;
}

describe('the Mermaid point layers on a braille display', () => {
  it('reads a quadrant chart as a count per quadrant', () => {
    const layer = firstLayer('quadrantChart', {
      getQuadrantData: () => ({
        quadrants: [
          { x: 50, y: 0, width: 50, height: 50, text: { text: 'Expand' } },
          { x: 0, y: 0, width: 50, height: 50, text: { text: 'Promote' } },
          { x: 0, y: 50, width: 50, height: 50, text: { text: '' } },
          { x: 50, y: 50, width: 50, height: 50, text: { text: '' } },
        ],
        points: [
          { x: 75, y: 25, text: { text: 'C' } },
          { x: 80, y: 10, text: { text: 'B' } },
          { x: 10, y: 90, text: { text: 'A' } },
        ],
        axisLabels: [],
      }),
    });

    const braille = gridBraille(layer);

    expect(braille.empty).toBe(false);
    if (!braille.empty && 'values' in braille) {
      // Bottom row first: A bottom left; B and C top right.
      expect(braille.values).toEqual([[1, 0], [0, 2]]);
    }
  });

  it('reads a Wardley map as a count per stage of evolution', () => {
    const layer = firstLayer('wardley', {
      getWardleyData: () => ({
        nodes: [
          { id: 'User', label: 'User', x: 50, y: 95 },
          { id: 'Tea', label: 'Tea', x: 80, y: 60 },
          { id: 'Kettle', label: 'Kettle', x: 35, y: 43 },
        ],
        links: [],
        trends: [],
      }),
    });

    const braille = gridBraille(layer);

    expect(braille.empty).toBe(false);
    if (!braille.empty && 'values' in braille) {
      expect(braille.values).toEqual([
        [0, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 0, 1],
        [0, 0, 1, 0],
      ]);
    }
  });
});
