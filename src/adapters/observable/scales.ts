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
 * Values within a billionth of the span of zero snap to zero, which is what a
 * bar's baseline inverts to.
 *
 * @param value - The inverted value.
 * @param span  - The domain span from {@link scaleSpan}.
 * @returns The cleaned value.
 *
 * @example
 * cleanNumber(3.141589999999974, 1246.8); // => 3.14159
 * cleanNumber(-1.652e-13, 1246.8);        // => 0
 */
export function cleanNumber(value: number, span: number): number {
  if (!Number.isFinite(value))
    return value;
  if (span > 0 && Math.abs(value) < span * 1e-9)
    return 0;
  const magnitude = Math.abs(span) || Math.abs(value) || 1;
  const decimals = Math.min(15, Math.max(0, 10 - Math.floor(Math.log10(magnitude))));
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
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
  if (inverted instanceof Date)
    return inverted.toISOString();
  const numeric = toNumber(inverted);
  return numeric === null ? null : cleanNumber(numeric, scaleSpan(scale));
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
 * The result is deliberately shaped like a real {@link PlotScale} so the rest
 * of the adapter cannot tell the difference.
 *
 * @param svg  - The plot's `<svg>`.
 * @param axis - Which axis to fit, matching Plot's `aria-label` prefix.
 * @returns The fitted scale, or `undefined` when the axis has too few ticks.
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
  if (numeric.every(t => t.value !== null)) {
    const first = numeric[0] as { pixel: number; value: number };
    const last = numeric[numeric.length - 1] as { pixel: number; value: number };
    if (first.pixel === last.pixel || first.value === last.value)
      return undefined;
    const slope = (last.value - first.value) / (last.pixel - first.pixel);
    return {
      type: 'linear',
      domain: [first.value, last.value],
      range: [first.pixel, last.pixel],
      apply: value => first.pixel + ((toNumber(value) ?? first.value) - first.value) / slope,
      invert: pixel => first.value + ((toNumber(pixel) ?? 0) - first.pixel) * slope,
    };
  }

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
  const cleaned = label.replace(/[\s,]/g, '').replace(/\u2212/g, '-');
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(cleaned))
    return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Coerces a value to a finite number, or `null`. */
export function toNumber(value: unknown): number | null {
  if (value instanceof Date)
    return value.getTime();
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
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
