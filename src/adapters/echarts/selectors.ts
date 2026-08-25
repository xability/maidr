/**
 * Locating the marks an ECharts chart drew, so a layer can point at them.
 *
 * ECharts gives a reading nothing to address by: the SVG is one flat `<g>`
 * with no ids, no `data-*` attributes and only generated `zr0-cls-N` classes,
 * `dataIndex` is not set on the traversed zrender elements in the production
 * build, and the element-to-DOM-node mapping is not exposed by any public
 * property. Measured on echarts 6.1.0 in Chromium (#1195).
 *
 * What the drawing does give is a clean separation by paint, and marks that
 * are contiguous in data order:
 *
 * | what | fill | stroke |
 * |---|---|---|
 * | gridline, axis line | `none` | grey |
 * | **bar / scatter mark** | the series colour | -- |
 * | **line** | `none` | the series colour, `stroke-width: 2` |
 * | area fill | the series colour | none |
 * | hover symbol | `#fff` | the series colour |
 * | border artefact | `#000` | none |
 *
 * So a mark is found by its paint, checked against what the model says was
 * drawn, and stamped. **A count that disagrees drops the highlighting for
 * that series** rather than outlining the wrong datum -- the discipline the
 * Google Charts Calendar established (#1174), and the only safe answer when
 * position is the only handle.
 */

/**
 * What each mark is stamped with, so a selector names one by position.
 *
 * Two attributes rather than one, because a chart holding both a bar and a
 * line is stamped twice and each pass clears its own marks first: sharing an
 * attribute made the second pass wipe what the first had just written, and
 * every bar selector then resolved to nothing while the line's still worked.
 */
const DATUM_ATTRIBUTE = 'data-maidr-echart-mark';
const SERIES_ATTRIBUTE = 'data-maidr-echart-line';

/**
 * Paints that are chart furniture rather than data.
 *
 * Black is the border artefact ECharts draws one of per series, and also the
 * background it puts behind an axis name; white backs the hover symbols.
 * None of them is a mark, and all of them would otherwise be counted as one.
 *
 * **A series painted pure black loses its highlighting** rather than
 * mis-outlining: its marks are excluded here, the count check then fails, and
 * the chart reads without an outline. That is the same conservative failure
 * the count check exists to produce, and it is the price of a drawing whose
 * only handle is paint.
 */
const FURNITURE_FILLS = new Set(['none', 'transparent', '#000000', '#ffffff']);

/**
 * One colour, spelled one way.
 *
 * The same black arrives as `#000` on the border artefact and as
 * `rgb(0,0,0)` on an axis name's background -- measured, and the second
 * spelling slipped past a set that only held the first, so a chart with a
 * named axis counted one furniture element as a mark and lost its
 * highlighting to the mismatch.
 *
 * @param paint - A `fill` attribute as written in the SVG
 * @returns A lower-case `#rrggbb`, or the keyword unchanged
 */
function normalise(paint: string): string {
  const trimmed = paint.trim().toLowerCase();

  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(trimmed);
  if (rgb) {
    return `#${rgb.slice(1, 4).map(part => Number(part).toString(16).padStart(2, '0')).join('')}`;
  }

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(trimmed);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  }

  return trimmed;
}

/**
 * Whether an element is painted as a solid mark -- a bar, a scatter symbol or
 * an area's fill.
 *
 * @param element - A candidate element from the chart's SVG
 * @returns True when its fill is a series colour
 */
function isFilledMark(element: Element): boolean {
  const fill = element.getAttribute('fill');
  if (!fill) {
    return false;
  }

  return !FURNITURE_FILLS.has(normalise(fill));
}

/**
 * Whether an element is a drawn line rather than a gridline.
 *
 * Both are unfilled and stroked, and the one thing that separates them is
 * weight: measured, a series line carries `stroke-width: 2` while gridlines
 * and the axis line carry none at all. A hover symbol is stroked in the
 * series colour too, but it is *filled* `#fff`, so it never reaches here.
 *
 * @param element - A candidate element from the chart's SVG
 * @returns True when it is a series' polyline
 */
function isStrokedLine(element: Element): boolean {
  const fill = element.getAttribute('fill');
  if (fill && !FURNITURE_FILLS.has(normalise(fill))) {
    return false;
  }
  if (!element.getAttribute('stroke')) {
    return false;
  }

  return Number.parseFloat(element.getAttribute('stroke-width') || '0') >= 1;
}

/**
 * Every element that is a mark of some kind, in the order the chart drew it.
 *
 * @param container - The element the chart was rendered into
 * @param kind      - Whether the series draws one element per datum
 * @returns The candidates, in DOM order
 */
function candidates(container: HTMLElement, kind: 'filled' | 'stroked'): Element[] {
  const svg = container.querySelector('svg');
  if (!svg) {
    return [];
  }

  const test = kind === 'filled' ? isFilledMark : isStrokedLine;

  return Array.from(svg.querySelectorAll('path,rect,circle')).filter(test);
}

/**
 * Clears the marks of one kind that a previous initialisation left behind.
 *
 * @param container - The element the chart was rendered into
 * @param attribute - Which kind of stamp to clear
 */
function unstamp(container: HTMLElement, attribute: string): void {
  container
    .querySelectorAll(`[${attribute}]`)
    .forEach(element => element.removeAttribute(attribute));
}

/**
 * Stamps a chart's per-datum marks and returns one selector per datum.
 *
 * The marks of every series are found together, because they are painted the
 * same way and only their order tells them apart -- so the total is checked
 * once, against what every series says it drew, and a mismatch drops the
 * highlighting for the whole chart.
 *
 * @param container - The element the chart was rendered into
 * @param drawn     - How many marks each series drew, in series order
 * @returns One selector list per series, or `undefined` when the drawing does
 *   not match what the model described
 */
export function markPerDatum(
  container: HTMLElement,
  drawn: number[],
): string[][] | undefined {
  unstamp(container, DATUM_ATTRIBUTE);

  const expected = drawn.reduce((total, count) => total + count, 0);
  if (expected === 0) {
    return undefined;
  }

  const marks = candidates(container, 'filled');
  if (marks.length !== expected) {
    console.warn(
      `[MAIDR] ECharts mark count mismatch: expected ${expected}, found ${marks.length}. `
      + 'Visual highlighting is disabled for this chart.',
    );
    return undefined;
  }

  marks.forEach((mark, index) => mark.setAttribute(DATUM_ATTRIBUTE, `${index}`));

  const selectors: string[][] = [];
  let offset = 0;
  for (const count of drawn) {
    selectors.push(
      Array.from(
        { length: count },
        (_, index) => selectorFor(container, DATUM_ATTRIBUTE, offset + index),
      ),
    );
    offset += count;
  }

  return selectors;
}

/**
 * Stamps a chart's per-series polylines and returns one selector per series.
 *
 * @param container - The element the chart was rendered into
 * @param count     - How many series drew a line
 * @returns One selector per series, or `undefined` on a mismatch
 */
export function markPerSeries(
  container: HTMLElement,
  count: number,
): string[] | undefined {
  unstamp(container, SERIES_ATTRIBUTE);

  if (count === 0) {
    return undefined;
  }

  const lines = candidates(container, 'stroked');
  if (lines.length !== count) {
    console.warn(
      `[MAIDR] ECharts line count mismatch: expected ${count}, found ${lines.length}. `
      + 'Visual highlighting is disabled for this chart.',
    );
    return undefined;
  }

  lines.forEach((line, index) => line.setAttribute(SERIES_ATTRIBUTE, `${index}`));

  return lines.map((_, index) => selectorFor(container, SERIES_ATTRIBUTE, index));
}

function selectorFor(
  container: HTMLElement,
  attribute: string,
  index: number,
): string {
  return `#${container.id} svg [${attribute}="${index}"]`;
}
