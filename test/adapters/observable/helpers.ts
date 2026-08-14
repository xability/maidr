/**
 * Test harness for the Observable Plot adapter.
 *
 * Mounts a captured chart from {@link FIXTURES} into a fresh JSDOM document
 * and, unless a test is exercising the fallback path, gives it back the
 * `scale` function Plot hangs off the node it returns.
 *
 * That function is rebuilt here rather than captured, because it is a closure.
 * The rebuild is the same arithmetic d3 does — a linear scale interpolates
 * between the domain and the range, a band scale looks its category up — and
 * it is checked by the assertions rather than trusted: every fixture's pixel
 * coordinates came from the real Plot, so a scale that did not match Plot's
 * would recover values that are not the data the chart was drawn from, and
 * every test would fail.
 */

import type { Fixture, FixtureScaleSpec } from './fixtures';
import { JSDOM } from 'jsdom';
import { FIXTURES } from './fixtures';

/** A mounted fixture, ready to hand to the adapter. */
export interface MountedFixture {
  /** The JSDOM window, for tests that need `CustomEvent` or an observer. */
  dom: JSDOM;
  document: Document;
  /** The chart's root — a `<figure>` when the fixture has one, else the `<svg>`. */
  element: Element;
  /** The chart's `<svg>`, which is what selectors are scoped to. */
  svg: Element;
}

/**
 * Mounts a captured chart into a fresh document.
 *
 * @param key         - Which fixture to mount.
 * @param withScales  - When `false`, the chart is mounted without Plot's
 *                      `scale` function, as one revived from saved HTML would
 *                      be. Defaults to `true`.
 * @returns The mounted chart.
 */
export function mountFixture(key: keyof typeof FIXTURES, withScales = true): MountedFixture {
  const fixture: Fixture = FIXTURES[key];
  const dom = new JSDOM(`<!doctype html><body><div id="host">${fixture.html}</div></body>`);
  const { document } = dom.window;
  const host = document.querySelector('#host');
  const element = host?.firstElementChild;
  const svg = element?.tagName.toLowerCase() === 'svg' ? element : element?.querySelector('svg');
  if (!element || !svg)
    throw new Error(`fixture "${String(key)}" did not mount`);

  if (withScales)
    attachScales(element, fixture.scales);

  return { dom, document, element, svg };
}

/**
 * Gives an element the `scale` function Plot would have put there.
 *
 * @param element - The chart's root element.
 * @param specs   - The captured scale descriptors.
 */
export function attachScales(element: Element, specs: Record<string, FixtureScaleSpec>): void {
  const built = new Map<string, unknown>();
  for (const [name, spec] of Object.entries(specs))
    built.set(name, buildScale(spec));

  Object.defineProperty(element, 'scale', {
    configurable: true,
    value: (name: string) => built.get(name),
  });
}

/**
 * Rebuilds one scale's `apply` and `invert` from its description.
 *
 * @param spec - The captured descriptor.
 * @returns The descriptor with its functions restored.
 */
function buildScale(spec: FixtureScaleSpec): Record<string, unknown> {
  const scale: Record<string, unknown> = { ...spec };
  delete scale.positions;
  delete scale.colors;

  if (spec.positions) {
    const positions = new Map(spec.domain.map((value, index) => [value, spec.positions?.[index]]));
    scale.apply = (value: unknown) => positions.get(value as string | number);
    return scale;
  }

  if (spec.colors) {
    const colors = new Map(spec.domain.map((value, index) => [value, spec.colors?.[index]]));
    scale.apply = (value: unknown) => colors.get(value as string | number);
    return scale;
  }

  const [d0, d1] = spec.domain as number[];
  const [r0, r1] = spec.range as number[];
  scale.apply = (value: unknown) => r0 + ((value as number) - d0) / (d1 - d0) * (r1 - r0);
  scale.invert = (pixel: unknown) => d0 + ((pixel as number) - r0) / (r1 - r0) * (d1 - d0);
  return scale;
}
