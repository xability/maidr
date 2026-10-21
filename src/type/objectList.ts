import type { AxisType } from '@type/state';

/**
 * The object list: every focusable thing on a chart that is not walked along x
 * and y axes -- the nodes of a network, the tiles of a treemap, the regions of
 * a map -- listed so the reader can sort it, narrow it, and jump straight to
 * one of them with `o`.
 *
 * A trace that offers one builds it from its own structure, which is the only
 * place that knows what an object is on that chart, what its size means, and
 * which ways of narrowing the list a reader of that chart would reach for.
 */

/**
 * An object's own value, given raw so the dialog can format it with the
 * layer's format -- the one its announcement uses -- which the model cannot
 * reach.
 */
export interface ObjectValue {
  /** What the value is called, as the announcement names it: "Population". */
  readonly label: string;
  readonly value: number;
  /** Which axis's format applies. */
  readonly axis: AxisType;
}

/** One thing the object list can take the reader to. */
export interface ChartObject {
  /**
   * Identity within the layer, taken from the data rather than from where the
   * object sits -- a node's name, a tile's path -- so it survives sorting,
   * filtering, a change of language and a rebuild of the chart. The trace
   * finds the object again by this when it is chosen, so a chart that changed
   * under an open list never sends the reader somewhere else.
   */
  readonly key: string;
  /** What the object is called, as its announcement names it. */
  readonly label: string;
  /** Its value, when it has one the announcement gives. */
  readonly value?: ObjectValue;
  /** What else the list says about it, in the reader's language: "Links: 5". */
  readonly detail?: string;
  /** The cell the cursor is taken to. */
  readonly row: number;
  readonly col: number;
  /**
   * Numeric properties, by the id of an {@link ObjectMeasure}. A missing or
   * non-finite value is unknown, and sorts last whichever way the list runs.
   */
  readonly measures: Readonly<Record<string, number>>;
  /** The ids of the filters it belongs to. */
  readonly groups: readonly string[];
}

/** A number the list can be sorted by. */
export interface ObjectMeasure {
  readonly id: string;
  /** What it is called: "Betweenness". */
  readonly label: string;
  /**
   * Whether every object's value or detail already says it, so a list sorted
   * by it need not say it again. A measure that is not spoken is read out
   * beside each object while the list is sorted by it -- a list ordered by
   * centrality has to say what the centrality is.
   */
  readonly spoken: boolean;
}

/** How a sort orders the list. */
export type ObjectOrder
  = | { readonly kind: 'chart' }
    | { readonly kind: 'name'; readonly direction: 'ascending' | 'descending' }
    | {
      readonly kind: 'measure';
      readonly measure: string;
      readonly direction: 'ascending' | 'descending';
    };

/** One way of ordering the list, named for the reader. */
export interface ObjectSortOption {
  readonly id: string;
  readonly label: string;
  readonly order: ObjectOrder;
}

/** One way of narrowing the list, named for the reader. */
export interface ObjectFilterOption {
  readonly id: string;
  /** What it shows, without a count: "Level 2", "Graph inputs". */
  readonly label: string;
}

/** Everything a trace offers the object list. */
export interface ChartObjectList {
  /** What the objects are, as a heading: "Nodes". */
  readonly title: string;
  /**
   * How many there are, in words: "1 node", "42 nodes". A function rather
   * than a noun to put after a number, because a noun cannot be: English
   * has a singular, German capitalises, and Korean, Japanese and Chinese
   * count with a counter word.
   */
  readonly count: (count: number) => string;
  /** Every object, in the chart's own order. */
  readonly objects: readonly ChartObject[];
  /** The numbers the sorts below order by. */
  readonly measures: readonly ObjectMeasure[];
  /** The sorts that make sense on this chart. The first is the default. */
  readonly sorts: readonly ObjectSortOption[];
  /**
   * The filters that make sense on this chart, in the order they are stepped
   * through. Showing everything is implicit and not listed, and a filter that
   * would match nothing, or everything, is not offered.
   */
  readonly filters: readonly ObjectFilterOption[];
  /**
   * Measures too costly to work out until a sort asks for them, by measure
   * id: each gives one value per object, in the order of `objects`. A graph's
   * centrality is the case -- a walk from every node, which the reader should
   * pay for only when they choose to sort by it, not on every `o`.
   */
  readonly deferred?: Readonly<Record<string, () => readonly number[]>>;
}
