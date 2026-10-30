/**
 * @jest-environment jsdom
 */

import type { Maidr, MaidrLayer } from '@type/grammar';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { Orientation } from '@type/grammar';

/**
 * An authored example names its chart, its axes and its series with the words
 * it draws, and declares its magnitudes running the way it draws them.
 *
 * A reader meets the chart through what the page declares: the title in its
 * accessible name, the description and `L T`, an axis label before every
 * value, the direction a layer is announced in. A sighted colleague meets the
 * drawing. Where the two disagreed -- a title with a type prefix the drawing
 * does not carry, a legend titled "Category" read as "Cats", a funnel whose
 * counts are drawn as widths announced as vertical -- they were describing
 * two different charts, and nothing else holds an example to its own drawing.
 *
 * A matplotlib SVG writes every text it draws as glyphs behind a comment
 * holding the text, so a page draws a text when its SVG carries that comment
 * or a `<text>` element holding it.
 */

const EXAMPLES = join(__dirname, '..', '..', 'examples');

/**
 * Undoes the entity escaping a `maidr` attribute carries.
 *
 * @param raw - The attribute's text as it appears in the page
 * @returns The JSON it stands for
 */
function unescapeHtml(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, '\'')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&#10;/g, '\n')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * An example page's source.
 *
 * @param page - The file name under `examples/`
 * @returns The page's HTML
 */
function read(page: string): string {
  return readFileSync(join(EXAMPLES, page), 'utf8');
}

/**
 * The object literal a script opens at an index, up to its matching brace.
 *
 * @param source - The script
 * @param start - The index of its opening brace
 * @returns The literal's source
 */
function objectAt(source: string, start: number): string {
  let depth = 0;
  let inString = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (char === '\\') {
        index++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}' && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error('the object literal never closes');
}

/**
 * The spec an example page carries, in a `var maidr = ...` script or in a
 * `maidr` or `maidr-data` attribute.
 *
 * @param html - The page's HTML
 * @returns The spec
 */
function specOf(html: string): Maidr {
  const script = html.indexOf('var maidr = ');
  if (script !== -1) {
    return JSON.parse(objectAt(html, html.indexOf('{', script))) as Maidr;
  }
  const attribute = /\smaidr(?:-data)?=(['"])(\{[\s\S]*?\})\1/.exec(html);
  if (attribute === null) {
    throw new Error('the page declares no spec');
  }
  return JSON.parse(unescapeHtml(attribute[2])) as Maidr;
}

/**
 * Every layer of a spec, subplot by subplot.
 *
 * @param spec - The spec
 * @returns Its layers
 */
function layersOf(spec: Maidr): MaidrLayer[] {
  return spec.subplots.flat().flatMap(subplot => subplot.layers);
}

/**
 * Whether a page draws a text.
 *
 * @param html - The page's HTML
 * @param text - The text
 * @returns True when the SVG carries it as a comment or a `<text>` element
 */
function draws(html: string, text: string): boolean {
  return html.includes(`<!-- ${text} -->`) || new RegExp(`<text[^>]*>${escapeRegExp(text)}</text>`).test(html);
}

/**
 * A text with the characters a regular expression gives meaning to escaped.
 *
 * @param text - The text
 * @returns The text as a pattern that matches it literally
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The texts matplotlib drew inside an element, from the comments it wrote
 * beside their glyphs.
 *
 * @param root - The element
 * @returns The comments' texts, in document order
 */
function commentsIn(root: Element): string[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    texts.push((node.textContent ?? '').trim());
  }
  return texts;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('an authored example declares what it draws', () => {
  // The title the chart draws above its axes, and the one every layer of it
  // carries: a layer's `title` names the chart, so a figure's layers all carry
  // the same one (docs/SCHEMA.md). `stacked_bar.html` already did, and is here
  // so the pair of stacked examples cannot drift apart again.
  it.each([
    ['boxplot-horizontal.html', 'Horizontal Box Plot Example'],
    ['boxplot-vertical.html', 'Vertical Box Plot Example'],
    ['candlestick_multilayer.html', 'Stock Price with Volume'],
    ['dodged-barplot.html', 'Seaborn Dodged Bar Plot: Penguin Weight Counts'],
    ['errorbar-grouped.html', 'Average Total Bill by Day and Sex'],
    ['multilayer_plot.html', 'Multilayer Plot Example'],
    ['stacked-barplot.html', 'Passenger Count by Class and Survival Status on the Titanic'],
    ['stacked_bar.html', 'Passenger Count by Class and Survival Status on the Titanic'],
    ['vertical-candlestick.html', 'Stock Price AAPL'],
  ])('%s is titled "%s", as the chart is drawn', (page, title) => {
    const html = read(page);

    const titles = layersOf(specOf(html)).map(layer => layer.title);

    expect(draws(html, title)).toBe(true);
    expect(titles).toEqual(titles.map(() => title));
  });

  it('names the facet figure and each of its panels by the titles drawn for them', () => {
    const html = read('facet_barplot.html');
    const spec = specOf(html);
    document.body.innerHTML = html;

    // The panel a layer is drawn in is the axes holding the bars its
    // selectors name, and the panel's title is one of the texts drawn there.
    const misnamed = layersOf(spec).filter((layer) => {
      const bar = document.querySelector(layer.selectors as string);
      const panel = bar?.closest('g[id^="axes_"]');
      return panel == null || !commentsIn(panel).includes(layer.title ?? '');
    }).map(layer => layer.title);

    expect(draws(html, 'Facet Plot: Bar Charts by Condition')).toBe(true);
    expect(spec.title).toBe('Facet Plot: Bar Charts by Condition');
    expect(misnamed).toEqual([]);
  });

  // The legend title is the name a sighted reader has for the series; every
  // segment is announced as "<z label> is <series>".
  it.each([
    ['dodged-barplot.html', 'Category'],
    ['stacked-barplot.html', 'survived'],
    ['stacked_bar.html', 'survived'],
  ])('%s names its series "%s", the title its legend draws', (page, legendTitle) => {
    const html = read(page);

    const labels = layersOf(specOf(html)).map(layer => layer.axes?.z?.label);

    expect(draws(html, legendTitle)).toBe(true);
    expect(labels).toEqual([legendTitle]);
  });

  it('names the alluvial\'s nodes by what they are, not by the years its columns are headed with', () => {
    // A flow trace announces every node as "<x label> is <node>". The nodes
    // are "2019 Car", "2022 Transit": a commute mode in a year. "Year is 2019
    // Car" told the reader each one was a year.
    const html = read('alluvial.html');

    const label = layersOf(specOf(html))[0].axes?.x?.label;

    expect(draws(html, '2019 Car')).toBe(true);
    expect(label).toBe('Mode');
  });

  it('names the choropleth, which draws no title, for the example rate it shades', () => {
    // The values are made up for the example, so the title says so rather
    // than naming a statistic they are not; it had been a placeholder,
    // "Something per thousand, by state", read in the chart's name.
    const [layer] = layersOf(specOf(read('choropleth.html')));

    expect(layer.title).toBe('Example rate per 1,000 residents, by western state');
    expect(layer.axes?.y?.label).toBe('Rate per 1,000 residents');
  });

  it('declares the funnel in the direction its counts are drawn', () => {
    // `orientation` names the way the magnitude runs. The funnel's stages run
    // down the page and each count is a bar's width, so it is horizontal and
    // its `x` is the count: every width is the same multiple of its count,
    // give or take the pixel the narrowest bar is rounded to.
    const html = read('funnel.html');
    const [layer] = layersOf(specOf(html));
    document.body.innerHTML = html;
    const bars = [...document.querySelectorAll(layer.selectors as string)];
    const points = layer.data as { x: number | string; y: number | string }[];

    const horizontal = layer.orientation === Orientation.HORIZONTAL;
    const counts = points.map(point => Number(horizontal ? point.x : point.y));
    const drawn = bars.map(bar => Number(bar.getAttribute(horizontal ? 'width' : 'height')));
    const scale = drawn[0] / counts[0];

    expect(horizontal).toBe(true);
    expect(bars).toHaveLength(counts.length);
    for (const [index, count] of counts.entries()) {
      expect(Math.abs(drawn[index] - count * scale)).toBeLessThanOrEqual(1);
    }
  });
});
