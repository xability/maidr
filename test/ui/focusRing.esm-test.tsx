/**
 * @jest-environment jsdom
 */

/**
 * The focus ring MAIDR draws on a chart, and where it applies.
 *
 * A chart bound from the page -- a script tag, py-maidr, r-maidr -- shares the
 * page with stylesheets that may remove every outline, so its ring is
 * `!important`, with a light band on the chart's `<svg>` that keeps it visible
 * on a dark plot. A chart a React app renders gets a ring the app can replace.
 * What is checked is that each rule reaches the element it is meant for in
 * the DOM each path really builds: the bindings' own copies of the band were
 * written against their own class names, and a band whose selector misses the
 * `display: contents` element a bound chart sits in would draw nothing.
 *
 * An `esm-test` because mounting `Maidr` loads the chat panel, which imports
 * `react-markdown`, ESM-only.
 */

import type { Maidr as MaidrData } from '@type/grammar';
import { afterEach, describe, expect, it } from '@jest/globals';
import { act, render } from '@testing-library/react';
import { TraceType } from '@type/grammar';
import { disposeMaidrOnElement, initMaidrOnElement } from '@util/initMaidr';
import { Maidr } from '../../src/maidr-component';

/**
 * A one-layer bar chart with the given id.
 * @param id - The chart's id
 * @returns The chart's data
 */
function chartData(id: string): MaidrData {
  return {
    id,
    subplots: [[{
      layers: [{
        id: `${id}-layer`,
        type: TraceType.BAR,
        axes: { x: { label: 'Category' }, y: { label: 'Value' } },
        data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
      }],
    }]],
  };
}

/** The charts bound in a test, unbound after it. */
const bound: Element[] = [];

/**
 * Binds a chart the way the script tag does, from an `<svg>` in the page.
 * @param id - The chart's id
 * @returns The chart's `<svg>`
 */
function bindFromPage(id: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = id;
  const host = document.createElement('div');
  host.appendChild(svg);
  document.body.appendChild(host);
  act(() => initMaidrOnElement(chartData(id), svg));
  bound.push(svg);
  return svg;
}

/**
 * The plot element MAIDR made focusable around a chart.
 * @param id - The chart's id
 * @returns The plot element
 */
function plotOf(id: string): HTMLElement {
  const plot = document.querySelector<HTMLElement>(`#maidr-figure-${id} > div[tabindex="0"]`);
  if (plot === null) {
    throw new Error(`no plot for ${id}`);
  }
  return plot;
}

/**
 * Every style rule of the focus ring sheet, those under `@media` included.
 * @param inMedia - Whether to take the rules inside the forced-colours block
 * @returns The rules' selectors and declarations
 */
function ringRules(inMedia = false): Array<{ selector: string; text: string }> {
  const style = document.head.querySelector<HTMLStyleElement>('style[data-maidr-focus-ring]');
  const sheet = style?.sheet;
  if (!sheet) {
    throw new Error('no focus ring sheet');
  }
  const rules: Array<{ selector: string; text: string }> = [];
  for (const rule of Array.from(sheet.cssRules)) {
    if (rule instanceof CSSMediaRule) {
      if (inMedia) {
        for (const inner of Array.from(rule.cssRules)) {
          if (inner instanceof CSSStyleRule) {
            rules.push({ selector: inner.selectorText, text: inner.cssText });
          }
        }
      }
    } else if (rule instanceof CSSStyleRule && !inMedia) {
      rules.push({ selector: rule.selectorText, text: rule.cssText });
    }
  }
  return rules;
}

/**
 * The rules whose selector matches an element now.
 * @param element - The element
 * @param inMedia - Whether to look in the forced-colours block instead
 * @returns The matching rules' declarations
 */
function rulesMatching(element: Element, inMedia = false): string[] {
  return ringRules(inMedia)
    .filter(rule => rule.selector.split(/,(?![^(]*\))/).some(part => element.matches(part.trim())))
    .map(rule => rule.text);
}

afterEach(() => {
  act(() => {
    bound.splice(0).forEach(svg => disposeMaidrOnElement(svg));
  });
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('the focus ring sheet', () => {
  it('goes into the head once, first, beside the figure margin rule', () => {
    document.head.innerHTML = '<style id="page"></style>';

    bindFromPage('first');
    bindFromPage('second');

    expect(document.head.querySelectorAll('style[data-maidr-focus-ring]')).toHaveLength(1);
    expect(document.head.querySelectorAll('style[data-maidr-figure]')).toHaveLength(1);
    expect(document.head.querySelector('style[data-maidr-figure]')?.textContent).toContain('margin-left: 0');
    expect(document.head.lastElementChild?.id).toBe('page');
  });
});

describe('a chart bound from the page', () => {
  it('marks the element it is mounted in', () => {
    bindFromPage('marked');

    expect(document.querySelector('#maidr-article-marked')?.parentElement?.hasAttribute('data-maidr-embed')).toBe(true);
  });

  it('draws an !important ring on the plot while it has focus, and none without', () => {
    bindFromPage('ring');
    const plot = plotOf('ring');

    expect(rulesMatching(plot).filter(rule => rule.includes('!important'))).toEqual([]);

    plot.focus();
    const ring = rulesMatching(plot).filter(rule => rule.includes('!important'));
    expect(ring).toHaveLength(1);
    expect(ring[0]).toContain('outline-offset: -3px !important');
    expect(ring[0]).toContain('--maidr-focus-ring-color');
  });

  it('draws the light band on the chart\'s own svg, inside the element it is adopted into', () => {
    const svg = bindFromPage('band');
    const plot = plotOf('band');
    // The real shape: plot > div[display: contents] > svg.
    expect(svg.parentElement?.parentElement).toBe(plot);

    plot.focus();

    const band = rulesMatching(svg);
    expect(band).toHaveLength(1);
    expect(band[0]).toContain('outline-offset: -5px !important');
    expect(band[0]).toContain('--maidr-focus-ring-inner');
    expect(rulesMatching(svg, true).join('')).toContain('outline: none !important');
  });

  it('rings MAIDR\'s fields and buttons too', () => {
    bindFromPage('fields');
    const figure = document.getElementById('maidr-figure-fields');
    const field = document.createElement('textarea');
    figure?.appendChild(field);

    field.focus();

    expect(rulesMatching(field).join('')).toContain('outline-offset: 1px !important');
    expect(rulesMatching(field, true).join('')).toContain('Highlight !important');
  });
});

describe('a chart a React app renders', () => {
  it('gets a ring with no !important, which the app\'s own styles replace', () => {
    render(
      <Maidr data={chartData('app')}>
        <svg />
      </Maidr>,
    );
    const plot = plotOf('app');

    plot.focus();

    const rules = rulesMatching(plot);
    expect(rules).toHaveLength(1);
    expect(rules[0]).not.toContain('!important');
    expect(rules[0]).toContain(':where(');
    expect(rules[0]).toContain(':focus-visible');
  });
});
