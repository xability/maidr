/**
 * D3 binder for word clouds.
 *
 * Extracts each term and its weight from the `<text>` glyphs a cloud is drawn
 * as — laid out by `d3-cloud` or by hand — and generates the MAIDR JSON schema
 * for accessible interaction.
 *
 * The layout is deliberately not read. Where a term landed is a packing
 * artefact rather than data, so the payload is the term and its weight alone:
 * the weight is the one quantity a word cloud carries, and it is written down
 * nowhere on the page.
 */

import type { MaidrLayer, WordCloudPoint } from '../../../type/grammar';
import type { D3PanelScope } from '../selectors';
import type { D3BinderResult, D3BuiltLayer, D3WordCloudConfig } from '../types';
import { TraceType } from '../../../type/grammar';
import { scopeSelector } from '../selectors';
import { buildAxes, buildNoDatumError, buildNoElementsError, finalizeSingleChart, generateId, inferAccessor, queryD3Elements, resolveAccessor } from '../util';

/**
 * Binds a D3.js word cloud to MAIDR, generating the accessible data
 * representation.
 *
 * Point `selector` at the `<text>` elements — one per term. The default
 * accessors are `d3-cloud`'s own datum keys (`text` and `size`), since the
 * plugin writes them onto every word it lays out; a cloud drawn from another
 * shape names its keys through `x` / `y` as usual.
 *
 * The trace reads the terms heaviest first regardless of the order they are
 * emitted in, and matches the glyphs to them by the same permutation — so the
 * DOM order of the `<text>` elements (which for a cloud is packing order) does
 * not have to mean anything.
 *
 * @remarks
 * **Timing — call after D3 has rendered.** With `d3-cloud` that means inside
 * the layout's `on('end', …)` callback: the words are placed asynchronously,
 * so a binder called straight after `.start()` sees an empty SVG and throws
 * "No elements found for selector …".
 *
 * @see {@link MaidrD3}
 * @see {@link useD3Adapter}
 *
 * @param svg - The SVG element containing the D3 word cloud.
 * @param config - Configuration specifying the selector and data accessors.
 * @returns A {@link D3BinderResult} with the MAIDR data and generated layer.
 *
 * @example
 * ```ts
 * cloud()
 *   .words(terms.map(t => ({ text: t.term, size: t.count })))
 *   .on('end', words => {
 *     svg.selectAll('text.term').data(words).join('text')…;
 *     bindD3WordCloud(svgElement, {
 *       selector: 'text.term',
 *       title: 'Terms in the Abstracts',
 *       axes: { x: 'Term', y: 'Occurrences' },
 *     });
 *   })
 *   .start();
 * ```
 */
export function bindD3WordCloud(svg: Element, config: D3WordCloudConfig): D3BinderResult {
  return finalizeSingleChart(svg, config, buildWordCloudLayer(svg, config));
}

/**
 * Pure extraction core for word clouds. See {@link buildBarLayer} for the
 * single-chart vs multi-panel contract.
 *
 * @internal
 */
export function buildWordCloudLayer(root: Element, config: D3WordCloudConfig, panel?: D3PanelScope): D3BuiltLayer {
  const {
    title,
    axes,
    format,
    selector,
  } = config;

  const elements = queryD3Elements(root, selector);
  if (elements.length === 0) {
    throw buildNoElementsError(root, selector, 'word cloud term');
  }

  // `text` and `size` are the canonical keys rather than `x` and `y` here:
  // they are what `d3-cloud` binds, and a cloud laid out by anything else is
  // the exception. Both fall back to the usual aliases, `x` / `y` included.
  const firstDatum = elements[0].datum;
  const xAccessor = inferAccessor<string>(
    config,
    'x',
    'text',
    ['word', 'term', 'label', 'name', 'x'],
    firstDatum,
  );
  const yAccessor = inferAccessor<number | string>(
    config,
    'y',
    'size',
    ['value', 'weight', 'count', 'frequency', 'y'],
    firstDatum,
  );

  const data: WordCloudPoint[] = elements.map(({ datum, index }) => {
    if (datum === undefined || datum === null) {
      throw buildNoDatumError(selector, index);
    }
    return {
      x: String(resolveAccessor<string>(datum, xAccessor, index)),
      y: resolveAccessor<number | string>(datum, yAccessor, index),
    };
  });

  const layer: MaidrLayer = {
    id: generateId(),
    type: TraceType.WORD_CLOUD,
    title,
    // One scoped selector matching every glyph: the trace reorders them into
    // weight order itself, and withdraws highlighting if the count does not
    // match the terms rather than pairing them by guesswork.
    selectors: scopeSelector(root, selector, panel),
    axes: buildAxes(axes, format),
    data,
  };

  return { layer };
}
