import type { Subplot } from '@model/plot';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { resolveSubplotLayout } from '@util/subplotLayout';
// @ts-expect-error - jsdom is available transitively (rehype-mathjax → jsdom@22),
// no @types/jsdom installed. Test only uses public Element/JSDOM surface.
import { JSDOM } from 'jsdom';

const globals = globalThis as unknown as { document?: Document };
let savedDocument: Document | undefined;

beforeEach(() => {
  savedDocument = globals.document;
  const dom = new JSDOM('<!doctype html><body></body>');
  globals.document = dom.window.document as Document;
});

interface StubPanel {
  rect?: { top: number; left: number; width?: number; height?: number };
  layerSelector?: string;
}

function mockRect(
  el: Element,
  rect: { top: number; left: number; width?: number; height?: number },
): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      top: rect.top,
      left: rect.left,
      width: rect.width ?? 100,
      height: rect.height ?? 100,
      right: rect.left + (rect.width ?? 100),
      bottom: rect.top + (rect.height ?? 100),
      x: rect.left,
      y: rect.top,
    }),
    configurable: true,
  });
}

/**
 * Builds a minimal Subplot stand-in exposing only the accessors the layout
 * utility consumes: getHighlightElement() and getLayerSelector().
 */
function stubSubplot(panel: StubPanel): Subplot {
  let highlight: SVGElement | null = null;
  if (panel.rect) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    document.body.appendChild(el);
    mockRect(el, panel.rect);
    highlight = el;
  }
  return {
    getHighlightElement: () => highlight,
    getLayerSelector: () => panel.layerSelector ?? null,
  } as unknown as Subplot;
}

function grid(panels: StubPanel[][]): Subplot[][] {
  return panels.map(row => row.map(stubSubplot));
}

afterEach(() => {
  globals.document = savedDocument;
});

describe('resolveSubplotLayout panel-geometry fallback (no axes_* groups)', () => {
  it('detects inversion for rows emitted top-first', () => {
    const layout = resolveSubplotLayout(grid([
      [{ rect: { top: 0, left: 0 } }],
      [{ rect: { top: 100, left: 0 } }],
      [{ rect: { top: 200, left: 0 } }],
    ]));

    expect(layout.invertVertical).toBe(true);
    expect(layout.topLeftRow).toBe(0);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.visualOrderMap.get('1,0')).toBe(2);
    expect(layout.visualOrderMap.get('2,0')).toBe(3);
  });

  it('keeps native direction for rows emitted bottom-first (matplotlib convention)', () => {
    const layout = resolveSubplotLayout(grid([
      [{ rect: { top: 200, left: 0 } }],
      [{ rect: { top: 100, left: 0 } }],
      [{ rect: { top: 0, left: 0 } }],
    ]));

    expect(layout.invertVertical).toBe(false);
    expect(layout.topLeftRow).toBe(2);
    expect(layout.visualOrderMap.get('2,0')).toBe(1);
    expect(layout.visualOrderMap.get('0,0')).toBe(3);
  });

  it('numbers a 2x2 grid in visual reading order', () => {
    const layout = resolveSubplotLayout(grid([
      [{ rect: { top: 0, left: 0 } }, { rect: { top: 0, left: 300 } }],
      [{ rect: { top: 300, left: 0 } }, { rect: { top: 300, left: 300 } }],
    ]));

    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.visualOrderMap.get('0,1')).toBe(2);
    expect(layout.visualOrderMap.get('1,0')).toBe(3);
    expect(layout.visualOrderMap.get('1,1')).toBe(4);
    expect(layout.invertVertical).toBe(true);
  });

  it('falls back to data order when rects are degenerate (jsdom default)', () => {
    // No mocked rects: real jsdom elements report all-zero geometry.
    const subplots = grid([[{}], [{}]]);
    subplots.forEach(row => row.forEach((s) => {
      (s.getHighlightElement as unknown) = () => null;
    }));

    const layout = resolveSubplotLayout(subplots);

    expect(layout.invertVertical).toBe(false);
    expect(layout.topLeftRow).toBe(0);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.visualOrderMap.get('1,0')).toBe(2);
  });

  it('falls back to data order when any panel is missing geometry', () => {
    const layout = resolveSubplotLayout(grid([
      [{ rect: { top: 0, left: 0 } }],
      [{}],
    ]));

    expect(layout.invertVertical).toBe(false);
    expect(layout.topLeftRow).toBe(0);
  });

  it('falls back to data order when panels overlap exactly', () => {
    const layout = resolveSubplotLayout(grid([
      [{ rect: { top: 50, left: 50 } }],
      [{ rect: { top: 50, left: 50 } }],
    ]));

    expect(layout.invertVertical).toBe(false);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
  });

  it('measures the first layer-selector element when no highlight element exists', () => {
    const mark = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    mark.setAttribute('class', 'panel-a-mark');
    document.body.appendChild(mark);
    mockRect(mark, { top: 200, left: 0 });

    const mark2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    mark2.setAttribute('class', 'panel-b-mark');
    document.body.appendChild(mark2);
    mockRect(mark2, { top: 0, left: 0 });

    const layout = resolveSubplotLayout(grid([
      [{ layerSelector: '.panel-a-mark' }],
      [{ layerSelector: '.panel-b-mark' }],
    ]));

    expect(layout.invertVertical).toBe(false);
    expect(layout.topLeftRow).toBe(1);
    expect(layout.visualOrderMap.get('1,0')).toBe(1);
    expect(layout.visualOrderMap.get('0,0')).toBe(2);
  });
});

describe('resolveSubplotLayout axes-group path precedence', () => {
  it('uses axes_* group geometry when available, ignoring panel fallback', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);

    const panels = [
      { axesTop: 0, panelTop: 999 },
      { axesTop: 100, panelTop: 998 },
    ].map(({ axesTop, panelTop }, i) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('id', `axes_${i + 1}`);
      svg.appendChild(g);
      mockRect(g, { top: axesTop, left: 0 });

      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      g.appendChild(inner);
      mockRect(inner, { top: panelTop, left: 0 });

      return {
        getHighlightElement: () => inner,
        getLayerSelector: () => null,
      } as unknown as Subplot;
    });

    const layout = resolveSubplotLayout([[panels[0]], [panels[1]]]);

    // Axes groups (top 0 / 100) decide order — not the inner rects (999/998).
    expect(layout.invertVertical).toBe(true);
    expect(layout.visualOrderMap.get('0,0')).toBe(1);
    expect(layout.totalAxesCount).toBe(2);
  });
});
