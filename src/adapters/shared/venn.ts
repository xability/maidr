/**
 * Reading the label a Venn or Euler region was given.
 *
 * Both Chart.js (`chartjs-chart-venn`) and Highcharts name a region the author
 * did not name by joining its sets with `∩`. That name says nothing the sets
 * do not, so an adapter drops it and keeps only a name of the author's own.
 */

/**
 * Whether a region's label is only its sets joined by `∩`, as the charting
 * library labels a region the author did not name.
 *
 * The comparison ignores order and the spacing around `∩`: Highcharts sorts a
 * relation's sets in place while laying the diagram out, and an author may
 * write `A ∩ B` for the region the library calls `B∩A`. A label that only
 * mentions the sets, such as `A and B`, is the author's own and is not
 * matched.
 *
 * @param label - The region's label
 * @param names - The region's sets
 * @returns True when the label adds nothing to the sets
 */
export function isJoinedSets(label: string, names: string[]): boolean {
  const parts = label.split('∩').map(part => part.trim());
  return parts.length === names.length && parts.every(part => names.includes(part));
}
