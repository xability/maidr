import type {
  ChartObject,
  ObjectFilterOption,
  ObjectMeasure,
  ObjectOrder,
  ObjectSortOption,
} from '@type/objectList';
import type { MessageKey } from '@util/i18n';
import { getLocale, t } from '@util/i18n';

/**
 * The object list's sorting and filtering, and the pieces every chart's list
 * is built from.
 *
 * Pure, so a trace can build its list with these and the object list service
 * can rearrange it, without either one computing what the other does.
 */

let cachedCollator: { locale: string; collator: Intl.Collator } | null = null;

/**
 * Names compared as a reader expects: by the active language's alphabet,
 * ignoring case and accents, and with the numbers inside a name compared as
 * numbers, so "Node 2" comes before "Node 10".
 * @param a - One name
 * @param b - The other
 * @returns Negative, zero or positive, as `Array.prototype.sort` takes
 */
function compareNames(a: string, b: string): number {
  const locale = getLocale();
  if (cachedCollator?.locale !== locale) {
    cachedCollator = {
      locale,
      collator: new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    };
  }
  return cachedCollator.collator.compare(a, b);
}

/**
 * The list a sort and a filter make of a chart's objects.
 *
 * The sort is stable: objects that tie keep the chart's own order, so a list
 * sorted by a measure many objects share still reads in a predictable order.
 * An object whose measure is unknown sorts after every known one in both
 * directions -- "lowest first" should not open on the objects that have no
 * value at all.
 * @param objects - Every object, in the chart's order
 * @param order - How to sort them
 * @param filter - The id of the filter to apply, or null for all of them
 * @returns The objects to show, in the order to show them
 */
export function arrangeObjects(
  objects: readonly ChartObject[],
  order: ObjectOrder,
  filter: string | null,
): ChartObject[] {
  const shown = objects
    .map((object, position) => ({ object, position }))
    .filter(({ object }) => filter === null || object.groups.includes(filter));

  type Entry = (typeof shown)[number];
  const byChart = (a: Entry, b: Entry): number => a.position - b.position;
  let compare: (a: Entry, b: Entry) => number;
  switch (order.kind) {
    case 'chart':
      compare = byChart;
      break;

    case 'name': {
      const sign = order.direction === 'ascending' ? 1 : -1;
      compare = (a, b) => sign * compareNames(a.object.label, b.object.label) || byChart(a, b);
      break;
    }

    case 'measure': {
      const sign = order.direction === 'ascending' ? 1 : -1;
      const valueOf = (entry: Entry): number =>
        entry.object.measures[order.measure] ?? Number.NaN;
      compare = (a, b) => {
        const left = valueOf(a);
        const right = valueOf(b);
        const leftKnown = Number.isFinite(left);
        const rightKnown = Number.isFinite(right);
        if (leftKnown !== rightKnown) {
          return leftKnown ? -1 : 1;
        }
        if (!leftKnown || left === right) {
          return byChart(a, b);
        }
        return sign * (left - right);
      };
      break;
    }
  }
  return shown.sort(compare).map(({ object }) => object);
}

/**
 * The chart's own order, as a sort.
 * @param label - What the chart calls its order, when it has a better name
 * than "chart order": "graph order", "hierarchy order"
 * @returns The sort
 */
export function chartOrderSort(label: string = t('dialogs.objectSortChart')): ObjectSortOption {
  return { id: 'chart', label, order: { kind: 'chart' } };
}

/**
 * Alphabetical order.
 *
 * One way only: Z to A would lengthen every turn through the sorts for an
 * order nobody looks for, and End reaches the bottom of A to Z at once.
 * @returns The sort
 */
export function nameSort(): ObjectSortOption {
  return {
    id: 'name',
    label: t('dialogs.objectSortNameAscending'),
    order: { kind: 'name', direction: 'ascending' },
  };
}

/**
 * A measure, sorted one way.
 * @param measure - The measure
 * @param direction - Which way to sort
 * @returns The sort
 */
export function measureSort(
  measure: ObjectMeasure,
  direction: 'ascending' | 'descending',
): ObjectSortOption {
  return {
    id: `${measure.id}-${direction}`,
    label: direction === 'descending'
      ? t('dialogs.objectSortHighest', { measure: measure.label })
      : t('dialogs.objectSortLowest', { measure: measure.label }),
    order: { kind: 'measure', measure: measure.id, direction },
  };
}

/**
 * Whether sorting by a measure would order anything: it needs at least two
 * different known values. Betweenness on a graph of pairs, or children on a
 * flat treemap, is the same for every object, and a sort by it would only
 * repeat the chart's order under another name.
 * @param objects - Every object
 * @param measure - The id of the measure
 * @returns True when the measure tells two objects apart
 */
export function measureVaries(objects: readonly ChartObject[], measure: string): boolean {
  let first: number | null = null;
  for (const object of objects) {
    const value = object.measures[measure];
    if (value === undefined || !Number.isFinite(value)) {
      continue;
    }
    if (first === null) {
      first = value;
    } else if (value !== first) {
      return true;
    }
  }
  return false;
}

/**
 * The filters worth offering: those that leave something to show and
 * something out, and that show a set of objects no earlier filter already
 * shows. A filter matching every object changes nothing, one matching none
 * would open an empty list -- a trap for a keyboard -- and two with the same
 * members, "Level 2" and "Leaves" on a two-level tree, would make the reader
 * step through one list twice. The earlier of two such filters is kept, so a
 * chart lists the more specific wording first.
 * @param objects - Every object
 * @param candidates - The filters the chart could offer, in order
 * @returns The ones to offer, in the same order
 */
export function offerFilters(
  objects: readonly ChartObject[],
  candidates: readonly ObjectFilterOption[],
): ObjectFilterOption[] {
  const seen = new Set<string>();
  return candidates.filter((filter) => {
    const members: number[] = [];
    objects.forEach((object, position) => {
      if (object.groups.includes(filter.id)) {
        members.push(position);
      }
    });
    if (members.length === 0 || members.length === objects.length) {
      return false;
    }
    const signature = members.join(',');
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

/**
 * A count in words, from a pair of messages for one and for many.
 * @param one - The message for exactly one: "{count} node"
 * @param many - The message for any other count: "{count} nodes"
 * @returns A function giving the words for a count
 */
export function counter(one: MessageKey, many: MessageKey): (count: number) => string {
  return count => t(count === 1 ? one : many, { count });
}

/**
 * A key that tells apart objects sharing a name: the name, with how many
 * objects of that name came before it. Counted in the order the author
 * declared the data, which a rebuild keeps, rather than in the order the
 * chart walks it, which a change of values can reshuffle.
 * @returns A function giving each name in turn its key
 */
export function occurrenceKeys(): (name: string) => string {
  const seen = new Map<string, number>();
  return (name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return JSON.stringify([name, count]);
  };
}
