/**
 * @jest-environment jsdom
 */

/**
 * Tests for `PatternService` in `src/service/pattern.ts`.
 *
 * The service is driven one element at a time: high contrast walks every
 * filled mark of a stacked bar, dodged bar or pie chart and applies a pattern
 * to each. Anything the service allocates per call is therefore allocated once
 * per mark, on every focus-in and every live data update.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PatternService } from '@service/pattern';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * jsdom has no canvas, so `getContext` is a boundary to mock. The service only
 * round-trips a color through `fillStyle`, which a plain string property
 * models well enough.
 */
function installCanvasStub(): void {
  HTMLCanvasElement.prototype.getContext
    = (() => ({ fillStyle: '#000000' })) as unknown as HTMLCanvasElement['getContext'];
}

describe('patternService', () => {
  let service: PatternService;
  let svg: SVGSVGElement;
  let marks: SVGElement[];
  let createElement: jest.SpiedFunction<typeof document.createElement>;

  beforeEach(() => {
    installCanvasStub();
    document.body.innerHTML = '';

    svg = document.createElementNS(SVG_NAMESPACE, 'svg') as SVGSVGElement;
    marks = [];
    for (let i = 0; i < 12; i++) {
      const mark = document.createElementNS(SVG_NAMESPACE, 'rect');
      mark.setAttribute('fill', i % 2 === 0 ? '#1f77b4' : '#ff7f0e');
      svg.appendChild(mark);
      marks.push(mark);
    }
    document.body.appendChild(svg);

    service = new PatternService();
    service.initialize(svg);

    createElement = jest.spyOn(document, 'createElement');
  });

  afterEach(() => {
    createElement.mockRestore();
    service.dispose();
    document.body.innerHTML = '';
  });

  it('creates at most one canvas however many elements are patterned', () => {
    marks.forEach((mark, index) => {
      service.applyPattern(mark, {
        type: 'diagonal-stripes',
        baseColor: index % 2 === 0 ? '#1f77b4' : '#ff7f0e',
        patternColor: '#ffffff',
      });
    });

    const canvases = createElement.mock.calls.filter(([tag]) => tag === 'canvas');
    expect(canvases.length).toBeLessThanOrEqual(1);
  });

  it('reuses one pattern definition for a repeated configuration', () => {
    const config = {
      type: 'dots' as const,
      baseColor: '#1f77b4',
      patternColor: '#ffffff',
    };

    const first = service.getPattern(config);
    const second = service.getPattern(config);

    expect(second).toBe(first);
    expect(svg.querySelectorAll(`#${first}`)).toHaveLength(1);
  });
});
