/**
 * @jest-environment jsdom
 */

/**
 * Regression coverage for a layer whose `selectors` is an empty array.
 *
 * Producers emit `[]` when they cannot resolve any element for a layer —
 * r-maidr's patchwork output does this whenever a processor fails to resolve a
 * panel, and jsonlite serialises the empty R list as `[]`. `[]` is truthy, so
 * it slipped past every `if (!selector)` guard in the model layer and reached
 * `querySelectorAll`, which coerced it to `''` and threw. The throw escaped
 * figure construction, so MAIDR never attached: Tab did nothing and *every*
 * subplot went silent, including the ones whose selectors were valid.
 *
 * What is asserted here is the degraded outcome: the malformed layer loses
 * only its highlight, and the rest of the figure stays navigable.
 */

import type { Maidr, MaidrLayer, MaidrSubplot } from '@type/grammar';
import { beforeEach, describe, expect, test } from '@jest/globals';
import { Figure, Subplot } from '@model/plot';
import { TraceType } from '@type/grammar';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Renders two bars under `#bars` so a valid selector has something to match.
 */
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
 * Builds a bar layer. `selectors` is deliberately `unknown`: the point of this
 * suite is values that the grammar types as `string` but that arrive from
 * parsed JSON as something else.
 */
function barLayer(id: string, selectors: unknown): MaidrLayer {
  return {
    id,
    type: TraceType.BAR,
    selectors: selectors as string,
    data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
  };
}

function subplotWith(layer: MaidrLayer): MaidrSubplot {
  return { layers: [layer] };
}

/**
 * The reported figure: a well-formed subplot followed by one whose single
 * layer resolved to no selectors at all.
 */
function createMaidr(): Maidr {
  return {
    id: 'empty-selectors-test',
    subplots: [
      [subplotWith(barLayer('valid', '#bars > rect'))],
      [subplotWith(barLayer('broken', []))],
    ],
  };
}

/**
 * Reads a subplot's trace highlight after stepping off the initial entry —
 * `AbstractTrace.highlight` reports empty until the cursor has actually moved,
 * so checking it straight after construction would pass for the wrong reason.
 */
function highlightIsEmptyAfterMove(subplot: Subplot): boolean {
  const trace = subplot.activeTrace;
  trace.moveOnce('FORWARD');
  trace.moveOnce('FORWARD');

  const state = trace.state;
  if (state.empty) {
    throw new Error('trace state unexpectedly empty');
  }
  return state.highlight.empty;
}

describe('layer with an empty selectors array', () => {
  beforeEach(renderBars);

  test('constructs the figure instead of throwing', () => {
    expect(() => new Figure(createMaidr())).not.toThrow();
  });

  test('leaves every subplot in the figure reachable', () => {
    const figure = new Figure(createMaidr());

    // The whole point of the fix: the valid panel is still announced, rather
    // than the malformed sibling taking the entire figure down with it.
    expect(figure.state.empty).toBe(false);

    for (const row of [0, 1]) {
      expect(figure.moveToIndex(row, 0)).toBe(true);

      const state = figure.state;
      expect(state.empty).toBe(false);
      if (!state.empty) {
        expect(state.size).toBe(2);
        expect(state.subplot.empty).toBe(false);
      }
    }
  });

  test('degrades the malformed layer to no highlight', () => {
    // Silent layer, not an inert figure: the trace still reports audio,
    // braille and text; only its highlight is gone.
    const subplot = new Subplot(subplotWith(barLayer('broken', [])));
    expect(highlightIsEmptyAfterMove(subplot)).toBe(true);
  });

  test('keeps the highlight for a layer whose selector does resolve', () => {
    const subplot = new Subplot(subplotWith(barLayer('valid', '#bars > rect')));
    expect(highlightIsEmptyAfterMove(subplot)).toBe(false);
  });
});
