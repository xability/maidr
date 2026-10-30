/**
 * Leaves room inside a drawing for MAIDR's focus ring.
 *
 * The ring is drawn 5px into the chart -- a 3px ring and a 2px band inside
 * it (`FOCUS_RING_RULES` in `maidr-component.tsx`) -- over what is there. A
 * drawing that reaches its own edge loses that edge for as long as the reader
 * is in the chart: Mermaid crops a drawing to what it drew, so a railroad's
 * rule names, a packet's bit numbers, a sankey's node bars and a radar's title
 * sit at its very edge or past it, and Observable Plot draws its axis titles a
 * few pixels inside its own. Padding inside the size the drawing already has
 * (`border-box`) puts the ring over the padding instead.
 *
 * A pixel more than the ring: text starting at the drawing's very edge, as a
 * railroad's rule names do, is painted a pixel past the box it is laid out
 * in -- Firefox reports it there -- and at 5px that pixel sat under the band.
 *
 * A padding of the drawing's own is left as it is.
 *
 * @param svg - The drawing
 */
export function leaveRoomForFocusRing(svg: SVGSVGElement): void {
  if (svg.style.padding !== '') {
    return;
  }
  svg.style.padding = '6px';
  svg.style.boxSizing = 'border-box';
}
