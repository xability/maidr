/**
 * @jest-environment jsdom
 */

/**
 * A layer whose selectors resolve to nothing says so in the console.
 *
 * It still announces every point, sounds every value and moves the braille
 * cursor; it loses only the outline. That is silent by design -- one bad
 * layer must not take the figure down (#750) -- and it is why the 4.x
 * contract changes took the highlight off r-maidr's and py-maidr's charts
 * for weeks with nothing to show for it. The console is where a producer's
 * author looks, so the loss is said there, once per layer.
 */

import type { MaidrLayer } from '@type/grammar';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TraceFactory } from '@model/factory';
import { Orientation, TraceType } from '@type/grammar';
import { resetSelectorWarnings } from '@util/selectors';

const SVG_NS = 'http://www.w3.org/2000/svg';

// jsdom defines no per-tag SVG interfaces; the models branch on a few of them.
// Answer by tag, as a browser would.
for (const [name, tag] of [['SVGPathElement', 'path'], ['SVGImageElement', 'image'], ['SVGRectElement', 'rect']]) {
  const scope = globalThis as unknown as Record<string, unknown>;
  if (scope[name] === undefined) {
    scope[name] = class {
      public static [Symbol.hasInstance](value: unknown): boolean {
        return (value as Element | null)?.tagName === tag;
      }
    };
  }
}

let warn: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
  resetSelectorWarnings();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  document.body.innerHTML = '';
});

/** Every console warning so far, as text. */
function warnings(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

/**
 * Draws a group of marks.
 * @param id - The group's id
 * @param tag - The element each mark is drawn as
 * @param names - One `data-name` per mark, in drawn order
 */
function draw(id: string, tag: string, names: string[]): void {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('id', id);
  names.forEach((name, i) => {
    const mark = document.createElementNS(SVG_NS, tag);
    mark.setAttribute('data-name', name);
    mark.setAttribute('x', String(10 * (i + 1)));
    mark.setAttribute('y', String(10 * (i + 1)));
    mark.setAttribute('cx', String(10 * (i + 1)));
    mark.setAttribute('cy', String(10 * (i + 1)));
    group.appendChild(mark);
  });
  svg.appendChild(group);
  document.body.appendChild(svg);
}

describe('a layer whose selectors resolve to nothing', () => {
  /** A bar layer whose selector matches nothing in the document. */
  function unresolved(): MaidrLayer {
    draw('bars', 'rect', ['a']);
    return {
      id: 'missing',
      type: TraceType.BAR,
      orientation: Orientation.VERTICAL,
      axes: {},
      selectors: '#not-drawn rect',
      data: [{ x: 'a', y: 1 }],
    } as unknown as MaidrLayer;
  }

  it('says so in the console, naming the layer and where the contract is', () => {
    TraceFactory.create(unresolved());

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/^\[MAIDR\] Layer "missing" \(bar\): /);
    expect(warnings()[0]).toMatch(/SCHEMA\.html#selectors/);
  });

  it('says it once, however often the layer is rebuilt', () => {
    // A live chart rebuilds its figure on every append.
    TraceFactory.create(unresolved());
    TraceFactory.create(unresolved());

    expect(warnings()).toHaveLength(1);
  });

  it('says nothing for a layer that names no elements', () => {
    draw('bars', 'rect', ['a']);
    TraceFactory.create({
      id: 'none',
      type: TraceType.BAR,
      orientation: Orientation.VERTICAL,
      axes: {},
      data: [{ x: 'a', y: 1 }],
    } as unknown as MaidrLayer);

    expect(warnings()).toEqual([]);
  });

  it('says nothing when the selectors resolve', () => {
    draw('bars', 'rect', ['a']);
    TraceFactory.create({
      id: 'found',
      type: TraceType.BAR,
      orientation: Orientation.VERTICAL,
      axes: {},
      selectors: '#bars rect',
      data: [{ x: 'a', y: 1 }],
    } as unknown as MaidrLayer);

    expect(warnings()).toEqual([]);
  });
});
