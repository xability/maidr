/**
 * What these tests protect.
 *
 * Three readings of a mark turn on one question — is this mark faceted? — and
 * they have to answer it the same way: which elements are its leaves, how it
 * splits into facets, and where Plot wrote the styling that says a `tick` is a
 * box plot's median (#1074). The rule lives in one place for that reason, and
 * this is the only thing that checks the rule itself rather than one of its
 * three uses.
 *
 * The half worth pinning is the one nothing else reaches. Plot nests a facet's
 * elements in a `<g>`, but a group of `<g>`s is only a facet container when
 * every last child is one: a mark whose children are a mixture drew those
 * groups itself, and treating them as facets would read one mark's parts as
 * several marks' worth of data.
 */

import { facetGroupsOf } from '@adapters/observable/introspect';
import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';

/**
 * Builds a mark group with the given children.
 *
 * @param inner - Markup for the group's children.
 * @returns The `<g>` element.
 */
function markGroup(inner: string): Element {
  const dom = new JSDOM(`<!doctype html><body><svg><g id="mark">${inner}</g></svg></body>`);
  const group = dom.window.document.querySelector('#mark');
  if (!group)
    throw new Error('group did not mount');
  return group;
}

describe('deciding whether a mark is faceted', () => {
  it('takes every child group as a facet when that is all there is', () => {
    const group = markGroup('<g><rect/></g><g><rect/></g>');

    expect(facetGroupsOf(group)).toHaveLength(2);
  });

  it('takes none when the children are a mixture', () => {
    // A mark that draws groups of its own alongside other elements — an axis
    // tick's line and its label, say. Reading those groups as facets would put
    // one mark's parts into separate subplots and leave the loose children out
    // of the chart entirely.
    const group = markGroup('<g><line/></g><text>1</text>');

    expect(facetGroupsOf(group)).toEqual([]);
  });

  it('takes none when no child is a group', () => {
    const group = markGroup('<rect/><rect/>');

    expect(facetGroupsOf(group)).toEqual([]);
  });

  it('takes none from a mark that drew nothing', () => {
    expect(facetGroupsOf(markGroup(''))).toEqual([]);
  });
});
