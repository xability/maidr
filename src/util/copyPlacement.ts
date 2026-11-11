/**
 * Where MAIDR puts the copies it makes of a chart's marks.
 *
 * The highlight works from copies: a hidden copy of each mark a selector
 * names, made when the chart takes focus, and the visible copy drawn over the
 * mark being read, with copies of the labels drawn over it. Each goes straight
 * after the element it is made from, which draws it in the same place as the
 * mark and just above it.
 *
 * A library that looks its own marks up again inside its groups finds the
 * copies there too. They carry its tags and classes but none of the data it
 * bound to its own elements, so plotly, restyling or redrawing a chart that
 * has focus, threw on a bar chart's copies and dealt a scatter trace's points
 * out to them. Such a library's adapter registers a placement, and copies of
 * its marks go where it says instead. Every other copy goes where it always
 * went.
 *
 * A copy put elsewhere is no longer the next sibling of its mark, which is how
 * `AbstractTrace.getAllOriginalElements` pairs a copy with its mark. So the
 * mark of each such copy is recorded here, and read back with
 * {@link markOfPlacedCopy}.
 */

import { Constant } from './constant';

/** A place for a copy: the element it goes in, and the child it goes before. */
export interface CopyPlace {
  /** The element the copy is inserted into. */
  readonly parent: Element;
  /** The child the copy is inserted before, or null to make it the last. */
  readonly before: Element | null;
}

/**
 * Where an adapter wants copies of one of its chart's marks to go.
 *
 * @param mark - The chart's own element the copy is made of
 * @returns The place for the copy, or null to put it straight after the
 *   element it was made from
 */
export type CopyPlacement = (mark: Element) => CopyPlace | null;

/** The placements adapters have registered, asked in the order registered. */
const placements: CopyPlacement[] = [];

/** The mark each copy put somewhere other than straight after it was made of. */
const placedCopies = new WeakMap<Element, Element>();

/**
 * Registers a placement for copies. Registering the same one again changes
 * nothing.
 *
 * @param placement - Where copies of the adapter's marks go
 */
export function placeCopiesWith(placement: CopyPlacement): void {
  if (!placements.includes(placement)) {
    placements.push(placement);
  }
}

/**
 * Puts a copy into the document: where a registered placement puts copies of
 * its mark, or else straight after the element it was made from.
 *
 * The element a copy is made from is the mark itself, or a copy of it -- the
 * highlight is copied from the hidden copy of the mark -- so a placement is
 * asked about the mark that copy was made of.
 *
 * @param source - The element the copy was made from, in the document
 * @param copy - The copy, not yet in the document
 */
export function insertCopy(source: Element, copy: Element): void {
  const mark = placedCopies.get(source) ?? source;
  for (const placement of placements) {
    const place = placement(mark);
    if (place !== null) {
      place.parent.insertBefore(copy, place.before);
      placedCopies.set(copy, mark);
      return;
    }
  }
  source.insertAdjacentElement(Constant.AFTER_END, copy);
}

/**
 * The mark a copy was made of, for a copy a placement put somewhere other than
 * straight after it.
 *
 * @param copy - A copy MAIDR made
 * @returns Its mark, or null for a copy that went straight after the element
 *   it was made from, which is found as its previous sibling
 */
export function markOfPlacedCopy(copy: Element): Element | null {
  return placedCopies.get(copy) ?? null;
}
