/**
 * Scale access and pixel-to-value inversion for the Observable Plot adapter.
 *
 * Plot draws marks at pixel coordinates and keeps the scales that produced
 * them on the returned node. Recovering a datum is therefore a matter of
 * reading an element's geometry and running it back through the right scale —
 * `invert` for a continuous axis, a walk of the domain for a band one.
 *
 * Two things make that less mechanical than it sounds, and both are handled
 * here:
 *
 * 1. **Float noise.** Inverting a pixel is a divide followed by a multiply, so
 *    a bar drawn for `3.14159` inverts to `3.141589999999809`. Announcing that
 *    to a screen reader is a defect, not a rounding detail, so every inverted
 *    number goes through {@link cleanNumber}.
 * 2. **A missing `scale`.** The function is an own property of the node Plot
 *    returned; it does not survive serialization. A plot found in a static
 *    HTML file has the markup and not the scales, so {@link deriveScale} fits
 *    one from the axis ticks Plot rendered.
 *
 * @packageDocumentation
 */

import type { ObservablePlotElement, PlotScale, PlotScales } from './types';
import { parseTranslate } from './introspect';

/** Scale names the adapter reads off a plot. */
const SCALE_NAMES = ['x', 'y', 'fx', 'fy', 'color', 'r'] as const;

/** Plot's scale types that map a continuous domain onto pixels. */
const CONTINUOUS_TYPES = new Set([
  'linear',
  'pow',
  'sqrt',
  'log',
  'symlog',
  'utc',
  'time',
  'identity',
]);

/**
 * The SI prefixes d3's default number format abbreviates with, so a tick
 * reading `1k` is recovered as 1000 rather than refused.
 *
 * Case matters, as it does in SI: `m` is milli and `M` is mega.
 */
const SI_SUFFIXES: Record<string, number> = {
  y: 1e-24,
  z: 1e-21,
  a: 1e-18,
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
  Z: 1e21,
  Y: 1e24,
};

/**
 * Finds the node carrying Plot's `scale` function.
 *
 * `Plot.plot()` attaches `scale` to whatever it returns. That is the `<svg>`
 * for a bare plot, but the `<figure>` when the plot has a title, subtitle,
 * caption, or legend — and in the wrapped case the inner `<svg>` carries
 * nothing. Callers hold either one depending on how they found the chart, so
 * this looks in both directions.
 *
 * @param element - Any element of the plot.
 * @returns The node whose `scale` is callable, or `null` when there is none.
 */
export function findScaleSource(element: Element): ObservablePlotElement | null {
  const candidates: (Element | null | undefined)[] = [
    element,
    element.closest('figure'),
    element.querySelector('svg'),
    element.parentElement,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof (candidate as ObservablePlotElement).scale === 'function')
      return candidate as ObservablePlotElement;
  }
  return null;
}

/**
 * Reads every scale a plot declares.
 *
 * Plot throws for a scale the chart does not have rather than returning
 * `undefined` in every version, so each lookup is guarded individually — one
 * missing `color` scale must not cost the caller its `x` and `y`.
 *
 * @param element - Any element of the plot.
 * @returns The scales that exist, keyed by name. Empty when `scale` is absent.
 */
export function readScales(element: Element): PlotScales {
  const source = findScaleSource(element);
  if (!source?.scale)
    return {};

  const scales: PlotScales = {};
  for (const name of SCALE_NAMES) {
    try {
      const scale = source.scale(name);
      if (scale && Array.isArray(scale.domain))
        scales[name] = scale;
    } catch {
      // Absent scale. Plot's own behaviour here has varied across versions;
      // treating a throw as "not present" is correct under all of them.
    }
  }
  return scales;
}

/** Whether a scale maps a continuous domain, and so can be inverted directly. */
export function isContinuous(scale: PlotScale | undefined): boolean {
  return !!scale && CONTINUOUS_TYPES.has(scale.type);
}

/** Whether a scale maps discrete categories onto pixels. */
export function isDiscrete(scale: PlotScale | undefined): boolean {
  return !!scale && (scale.type === 'band' || scale.type === 'point' || scale.type === 'ordinal');
}

/**
 * Whether a scale's domain is dates rather than numbers.
 *
 * A temporal axis inverts to a `Date`, which no MAIDR trace can carry: the
 * point types are typed `number` because the value has to drive sonification
 * and the min/max range. The adapter therefore carries epoch milliseconds and
 * declares `format: { type: 'date' }` on the axis, which is what turns the
 * number back into a date in the announcement.
 *
 * @param scale - The scale to test.
 * @returns True for Plot's `utc` and `time` scales.
 */
export function isTemporal(scale: PlotScale | undefined): boolean {
  return !!scale && (scale.type === 'utc' || scale.type === 'time');
}

/**
 * Whether a scale's domain contains zero.
 *
 * Only then can an inverted pixel legitimately be snapped to zero — on an axis
 * that runs from 1 to a billion, a value smaller than a billionth of the span
 * is an ordinary small value and not a bar's baseline.
 *
 * @param scale - The scale to test.
 * @returns True when zero lies between the domain's endpoints.
 */
function domainIncludesZero(scale: PlotScale | undefined): boolean {
  if (!scale || !Array.isArray(scale.domain) || scale.domain.length < 2)
    return false;
  const lo = toNumber(scale.domain[0]);
  const hi = toNumber(scale.domain[scale.domain.length - 1]);
  if (lo === null || hi === null)
    return false;
  return Math.min(lo, hi) <= 0 && Math.max(lo, hi) >= 0;
}

/**
 * The magnitude a continuous scale's domain spans, used to size rounding.
 *
 * @param scale - The scale to measure.
 * @returns The span, or `0` when the scale is not continuous or is degenerate.
 */
export function scaleSpan(scale: PlotScale | undefined): number {
  if (!scale || !Array.isArray(scale.domain) || scale.domain.length < 2)
    return 0;
  const lo = toNumber(scale.domain[0]);
  const hi = toNumber(scale.domain[scale.domain.length - 1]);
  if (lo === null || hi === null)
    return 0;
  return Math.abs(hi - lo);
}

/**
 * Removes the float noise that inverting a pixel coordinate introduces.
 *
 * The error is absolute rather than relative — it comes from arithmetic across
 * the whole domain, so a bar near zero on a chart that runs to 1200 is wrong in
 * the same decimal place as one near the top. Rounding is therefore sized from
 * the domain span and not from the value: keep ten digits below the span's
 * leading digit, which is far more precision than any plot's pixel resolution
 * can encode and far less than the noise floor.
 *
 * @param value - The inverted value.
 * @param span  - The domain span from {@link scaleSpan}.
 * @returns The cleaned value.
 *
 * @example
 * cleanNumber(3.141589999999974, 1246.8); // => 3.14159
 */
export function cleanNumber(value: number, span: number): number {
  if (!Number.isFinite(value))
    return value;
  const magnitude = Math.abs(span) || Math.abs(value) || 1;
  const fromSpan = 10 - Math.floor(Math.log10(magnitude));
  // A value far below the span's own scale still deserves its digits: on a log
  // axis running to a billion, the span sets `fromSpan` to 1 and a millionth
  // would round to nothing. Keeping ten significant figures of the value itself
  // costs nothing on an ordinary axis, where it is the smaller of the two.
  const fromValue = value === 0 ? 0 : 10 - Math.floor(Math.log10(Math.abs(value)));
  const decimals = Math.min(15, Math.max(0, fromSpan, fromValue));
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Rounds a value to the precision the drawn geometry can actually carry.
 *
 * A line's vertices are read back out of its `d` attribute, and the path
 * serializer writes each coordinate to a fixed number of decimal places — so
 * unlike a rect's `x` and `y`, the number is quantised before the adapter ever
 * sees it. On a chart spanning thousands of units that quantisation is worth
 * more than a unit of data, and reporting the inverted figure in full would
 * dress a rounded pixel up as an exact measurement.
 *
 * So the value is rounded to the granularity the pixel quantum buys, and no
 * finer. On an ordinary chart the quantum is worth far less than the last
 * decimal of the data, and the value comes back exact.
 *
 * @param value      - The inverted value.
 * @param scale      - The scale it was inverted through.
 * @param pixelError - Half the pixel quantum the coordinate was written at.
 * @returns The value, rounded to the precision the geometry supports.
 */
export function cleanToGeometry(
  value: number,
  scale: PlotScale | undefined,
  pixelError: number,
): number {
  const span = scaleSpan(scale);
  const pixels = rangePixels(scale);
  if (!Number.isFinite(value) || span <= 0 || pixels <= 0 || pixelError <= 0)
    return cleanNumber(value, span);

  const dataError = pixelError * span / pixels;
  // `floor(-log10 e)`, not `-floor(log10 e)`: the second is `ceil(-log10 e)`,
  // which keeps one digit finer than the uncertainty it is meant to cap and so
  // leaves a digit of pure pixel noise on the end of every value.
  const decimals = Math.min(15, Math.max(0, Math.floor(-Math.log10(dataError))));
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * How many pixels a scale's range covers.
 *
 * @param scale - The scale to measure.
 * @returns The width in pixels, or `0` when the range is not numeric.
 */
function rangePixels(scale: PlotScale | undefined): number {
  const range = scale?.range;
  if (!Array.isArray(range) || range.length < 2)
    return 0;
  const lo = toNumber(range[0]);
  const hi = toNumber(range[range.length - 1]);
  if (lo === null || hi === null)
    return 0;
  return Math.abs(hi - lo);
}

/**
 * The pixel intervals a band or point scale assigns to its categories.
 *
 * Marks are not always drawn flush to their band — Plot insets rect and cell
 * marks by half a pixel, and a dot sits at the band's midpoint — so matching a
 * pixel to a category by equality fails. Intervals let
 * {@link valueAtPixel} ask which band contains a point instead.
 *
 * @param scale - A band, point, or ordinal scale.
 * @returns One entry per domain value, ordered by pixel position.
 */
export function bandIntervals(
  scale: PlotScale,
): { value: string | number; start: number; end: number; center: number }[] {
  const apply = scale.apply;
  if (typeof apply !== 'function')
    return [];

  const width = typeof scale.bandwidth === 'number' && scale.bandwidth > 0
    ? scale.bandwidth
    : 0;

  const intervals = scale.domain
    .map((value) => {
      const start = toNumber(apply(value));
      if (start === null)
        return null;
      return {
        value: asKey(value),
        start,
        end: start + width,
        center: start + width / 2,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.start - b.start);

  // A point scale has no bandwidth: its categories are positions, not spans.
  // Give each one the half-step on either side so a mark drawn a fraction off
  // centre still lands in the right category.
  if (width === 0 && intervals.length > 1) {
    const step = typeof scale.step === 'number' && scale.step > 0
      ? scale.step
      : Math.abs(intervals[1].start - intervals[0].start);
    for (const interval of intervals) {
      interval.center = interval.start;
      interval.start = interval.center - step / 2;
      interval.end = interval.center + step / 2;
    }
  }

  return intervals;
}

/**
 * Maps a pixel coordinate back to the value the scale drew there.
 *
 * A temporal scale inverts to a `Date` and comes back as epoch milliseconds,
 * for the reason given on {@link isTemporal}. A band scale comes back as its
 * category.
 *
 * @param scale - The scale that positioned the mark.
 * @param pixel - The pixel coordinate read off the element.
 * @returns The domain value, or `null` when the scale cannot invert it.
 */
export function valueAtPixel(
  scale: PlotScale | undefined,
  pixel: number,
): string | number | null {
  if (!scale || !Number.isFinite(pixel))
    return null;

  if (isDiscrete(scale)) {
    const intervals = bandIntervals(scale);
    if (intervals.length === 0)
      return null;
    const containing = intervals.find(i => pixel >= Math.min(i.start, i.end) && pixel <= Math.max(i.start, i.end));
    if (containing)
      return containing.value;
    // Outside every band — pick the nearest centre rather than dropping the
    // point, which is what a half-pixel inset at the edge of the range needs.
    return intervals.reduce((best, current) =>
      Math.abs(current.center - pixel) < Math.abs(best.center - pixel) ? current : best).value;
  }

  const invert = scale.invert;
  if (typeof invert !== 'function')
    return null;

  const inverted = invert(pixel);
  const numeric = toNumber(inverted);
  if (numeric === null)
    return null;
  // Milliseconds, unrounded: a date's precision is its own, and the span of a
  // year's worth of them would otherwise round the time of day away.
  if (inverted instanceof Date)
    return Math.round(numeric);

  const span = scaleSpan(scale);
  // A bar's baseline inverts to a few parts in 1e13 of the span rather than to
  // zero. Snapping is only safe where zero is a value the axis actually draws:
  // on a log axis running to a billion, a millionth is an ordinary number.
  if (span > 0 && Math.abs(numeric) < span * 1e-12 && domainIncludesZero(scale))
    return 0;
  return cleanNumber(numeric, span);
}

/**
 * Maps a rendered fill colour back to the value the colour scale encoded.
 *
 * A cell mark carries its magnitude only in its fill, so a heatmap's z values
 * are unreadable without this. Continuous colour scales expose `invert`;
 * ordinal ones do not, and are matched against the range instead — which is
 * also what turns a series colour into its legend label.
 *
 * @param scale - The plot's colour scale.
 * @param color - The `fill` attribute read off the element.
 * @returns The domain value, or `null` when the colour is not on the scale.
 */
export function valueAtColor(
  scale: PlotScale | undefined,
  color: string | null,
): string | number | null {
  if (!scale || !color)
    return null;

  if (typeof scale.invert === 'function' && isContinuous(scale)) {
    const inverted = scale.invert(color);
    const numeric = toNumber(inverted);
    if (numeric !== null)
      return cleanNumber(numeric, scaleSpan(scale));
  }

  const apply = scale.apply;
  if (typeof apply !== 'function')
    return null;
  const target = normalizeColor(color);
  for (const value of scale.domain) {
    if (normalizeColor(String(apply(value))) === target)
      return asKey(value);
  }
  return null;
}

/**
 * Fits a scale from the axis ticks Plot rendered.
 *
 * This is the fallback for a plot whose `scale` function is gone — one parsed
 * out of saved HTML, or cloned through `innerHTML`. Plot draws every tick as a
 * `<text>` positioned by its own `transform`, in the same pixel space the marks
 * use, so a numeric axis can be recovered from two ticks and a categorical one
 * from all of them.
 *
 * Which of the two an axis is has to be read off the axis rather than guessed
 * from its labels, because guessing is how a chart gets transposed: an axis
 * labelled `10, 100, 1k, 10k` has labels that mostly do not parse as numbers,
 * and reading it as a set of categories turns a scatter plot into a horizontal
 * dot plot whose x values are the y axis's tick text. Plot sets
 * `font-variant="tabular-nums"` on a quantitative axis's labels and not on a
 * categorical one's, which settles it.
 *
 * The result is deliberately shaped like a real {@link PlotScale} so the rest
 * of the adapter cannot tell the difference.
 *
 * @param svg  - The plot's `<svg>`.
 * @param axis - Which axis to fit, matching Plot's `aria-label` prefix.
 * @returns The fitted scale, or `undefined` when the axis cannot be recovered
 *          faithfully — which leaves the chart unbound rather than wrong.
 */
export function deriveScale(svg: Element, axis: 'x' | 'y' | 'fx' | 'fy'): PlotScale | undefined {
  const group = svg.querySelector(`g[aria-label="${axis}-axis tick label"]`);
  if (!group)
    return undefined;

  const along: 'x' | 'y' = axis === 'y' || axis === 'fy' ? 'y' : 'x';
  const ticks: { label: string; pixel: number }[] = [];
  for (const text of Array.from(group.querySelectorAll('text'))) {
    const label = (text.textContent ?? '').trim();
    const pixel = translateOf(text, along);
    if (label && pixel !== null)
      ticks.push({ label, pixel });
  }
  if (ticks.length < 2)
    return undefined;

  const numeric = ticks.map(t => ({ ...t, value: parseTickNumber(t.label) }));
  // Plot's own signal, and only it. Labels that happen to parse as numbers say
  // nothing: a band axis of years is labelled 2020, 2021, 2022, and fitting a
  // line through those turns a bar chart's categories into a continuous axis —
  // which leaves the mark with no categorical axis at all, so it is dropped and
  // the chart never binds.
  const quantitative = group.getAttribute('font-variant') === 'tabular-nums';

  if (quantitative) {
    // A quantitative axis whose labels cannot all be read back is a dead end:
    // the pixel-to-value mapping is exactly what is missing, and there is
    // nothing else in the DOM that carries it.
    if (!numeric.every(t => t.value !== null))
      return undefined;
    const points = numeric as { pixel: number; value: number }[];
    const first = points[0];
    const last = points[points.length - 1];
    if (first.pixel === last.pixel || first.value === last.value)
      return undefined;
    const slope = (last.value - first.value) / (last.pixel - first.pixel);
    const invert = (pixel: unknown): number =>
      first.value + ((toNumber(pixel) ?? first.pixel) - first.pixel) * slope;

    // The straight line through the outermost ticks only describes a linear
    // axis. A log axis puts its ticks at 1, 10, 100 and the same line would
    // read every mark between them as a different number entirely — so the fit
    // is checked against every tick it did not come from, and a scale that
    // fails is not offered at all. The chart is then left unbound, which is the
    // right outcome: no announcement beats a confident wrong one.
    const tolerance = Math.abs(last.value - first.value) * 1e-6;
    for (const point of points.slice(1, -1)) {
      if (Math.abs(invert(point.pixel) - point.value) > tolerance)
        return undefined;
    }

    return {
      type: 'linear',
      domain: [first.value, last.value],
      range: [first.pixel, last.pixel],
      apply: value => first.pixel + ((toNumber(value) ?? first.value) - first.value) / slope,
      invert,
    };
  }

  // Not quantitative: the labels are the categories, whatever they look like.
  const step = Math.abs(ticks[1].pixel - ticks[0].pixel);
  const positions = new Map(ticks.map(t => [t.label, t.pixel]));
  return {
    type: 'point',
    domain: ticks.map(t => t.label),
    range: [ticks[0].pixel, ticks[ticks.length - 1].pixel],
    step,
    apply: value => positions.get(String(value)) ?? Number.NaN,
  };
}

/**
 * Reads one component of the pixel offset an element's own translate applies.
 *
 * Plot positions each tick label with a translate of its own, inside a group
 * that carries a small presentational nudge. Only the element's translate is
 * in the scale's coordinate space, so the group's is deliberately ignored.
 *
 * @param element - The element to read.
 * @param axis    - Which component of the translate to return.
 * @returns The offset, or `null` when the element has no translate.
 */
function translateOf(element: Element, axis: 'x' | 'y'): number | null {
  const translate = parseTranslate(element);
  if (!translate)
    return null;
  return axis === 'x' ? translate[0] : translate[1];
}

/**
 * Parses a rendered tick label back into a number.
 *
 * Plot's default formatter groups thousands -- with a comma or, in some
 * locales, a narrow space -- and writes a negative sign as a Unicode minus,
 * all of which `Number.parseFloat` rejects.
 *
 * @param label - The tick's text content.
 * @returns The number, or `null` when the label is not numeric.
 */
function parseTickNumber(label: string): number | null {
  // A comma is a thousands separator only where it groups three digits. In a
  // locale that writes a decimal comma, `1,5` is one and a half, and dropping
  // the comma would read it as fifteen — a wrong number where refusing to read
  // the axis at all is the right answer.
  const grouped = label.replace(/\s/g, '');
  if (grouped.includes(',') && !/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(grouped.replace(/\u2212/g, '-')))
    return null;
  const cleaned = grouped.replace(/,/g, '').replace(/\u2212/g, '-');
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([yzafpn\u00B5mkMGTPEZY]?)$/.exec(cleaned);
  if (!match)
    return null;
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed))
    return null;
  const suffix = match[2];
  return suffix ? parsed * (SI_SUFFIXES[suffix] ?? 1) : parsed;
}

/**
 * Coerces a value to a finite number, or `null`.
 *
 * Strings are converted whole rather than parsed from the front. The
 * difference matters: `Number.parseFloat` reads an ISO timestamp as the year,
 * so a date reaching a numeric field would be announced as `2024` — a
 * plausible-looking number that was never in the chart. Refusing it lets the
 * caller fall back or drop the point instead.
 *
 * @param value - The value to coerce.
 * @returns The number, or `null` when the value is not entirely one.
 */
export function toNumber(value: unknown): number | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '')
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Renders a domain value as something a MAIDR schema can carry.
 *
 * Dates become ISO strings so they survive `JSON.stringify` and read back the
 * same way on the other side of the `maidr-data` attribute.
 */
export function asKey(value: unknown): string | number {
  if (value instanceof Date)
    return value.toISOString();
  if (typeof value === 'number')
    return value;
  return String(value);
}

/** Normalises a CSS colour for comparison, collapsing case and whitespace. */
function normalizeColor(color: string): string {
  return color.trim().toLowerCase().replace(/\s+/g, '');
}
