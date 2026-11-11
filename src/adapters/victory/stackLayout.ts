import type { SegmentedPoint } from '@type/grammar';

/**
 * Where `VictoryStack` draws each point of a stack.
 *
 * `categories` are the categories of all the series, in the order Victory
 * places them along the axis. `places[series][point]` is the point's category
 * among them, and `slots[series][point]` is the same where Victory draws the
 * point a bar and null where it draws it none.
 */
export interface StackLayout {
  categories: SegmentedPoint['x'][];
  places: number[][];
  slots: (number | null)[][];
}

/**
 * Lays a stack's points out the way `VictoryStack` draws them.
 *
 * Victory fills every series out to the categories of all of them, in the
 * order of their positions on the axis, drawing a bar of no height for each
 * category a series lacks (victory-stack `fillData`). It walks each series
 * along those categories in step, so a point listed out of that order is
 * passed over and drawn nowhere. A category's position is its number or its
 * time, or for a name, the order the names first appear in, series by series.
 *
 * @param series - The layer's points, one row per series
 * @returns The layout, or null for categories of more than one kind
 */
export function stackLayout(series: SegmentedPoint[][]): StackLayout | null {
  const names = new Map<string, number>();
  const kinds = new Set<string>();
  const positionOf = (x: unknown): number => {
    if (typeof x === 'string') {
      kinds.add('name');
      if (!names.has(x))
        names.set(x, names.size + 1);
      return names.get(x) as number;
    }
    kinds.add(x instanceof Date ? 'time' : typeof x);
    return x instanceof Date ? x.getTime() : Number(x);
  };
  const positions = series.map(row => row.map(point => positionOf(point.x)));
  if (kinds.size > 1 || positions.some(row => row.some(position => !Number.isFinite(position)))) {
    return null;
  }

  // Each category as the first point to name it gives it.
  const named = new Map<number, SegmentedPoint['x']>();
  series.forEach((row, s) => row.forEach((point, i) => {
    if (!named.has(positions[s][i]))
      named.set(positions[s][i], point.x);
  }));
  const axis = [...named.keys()].sort((a, b) => a - b);
  const placeOf = new Map(axis.map((position, place) => [position, place]));

  const slots = positions.map((row) => {
    const placed = row.map((): number | null => null);
    let next = 0;
    axis.forEach((position, slot) => {
      if (row[next] === position) {
        placed[next] = slot;
        next++;
      }
    });
    return placed;
  });
  return {
    categories: axis.map(position => named.get(position) as SegmentedPoint['x']),
    places: positions.map(row => row.map(position => placeOf.get(position) as number)),
    slots,
  };
}

/**
 * Whether every series of a stack holds every category, in axis order: the
 * stack Victory draws one bar per point for, in the order of the points.
 *
 * @param layout - Where each point is drawn
 * @returns True when each point's place is its position in its series
 */
export function stackInStep(layout: StackLayout): boolean {
  return layout.slots.every(row => row.length === layout.categories.length && row.every((slot, i) => slot === i));
}

/**
 * Whether a stack is read category by category, each series padded out to
 * every category the stack draws ({@link stackByCategory}).
 *
 * A stack in step already is. One whose series miss categories, or list them
 * out of axis order, is read padded, so a series has a place at every category
 * and Up and Down stay in the category they are in. A series that names one
 * category twice has two points for one place, and such a stack is read as
 * its series list their points.
 *
 * @param layout - Where each point is drawn
 * @returns True when the stack is to be read padded
 */
export function stackReadByCategory(layout: StackLayout): boolean {
  return !stackInStep(layout) && layout.places.every(row => new Set(row).size === row.length);
}

/**
 * A stack's series padded out to every category the stack draws, in axis
 * order: each series' point at its category, and a gap where it has none.
 *
 * A gap is a point of no value (`NaN`), which the stacked bar trace announces
 * as missing and leaves out of the category's total, as the MUI X adapter
 * reads a bar its chart does not draw. A point Victory passes over keeps its
 * value at its category: the data has it, although no bar shows it.
 *
 * @param series - The layer's points, one row per series
 * @param layout - Where each point is drawn
 * @param names  - Each series' name, for its gaps
 * @returns One point per category per series
 */
export function stackByCategory(
  series: SegmentedPoint[][],
  layout: StackLayout,
  names: readonly (string | undefined)[],
): SegmentedPoint[][] {
  return series.map((row, s) => {
    const z = names[s] ?? row[0]?.z ?? '';
    const padded: SegmentedPoint[] = layout.categories.map(x => ({ x, y: Number.NaN, z }));
    row.forEach((point, i) => {
      padded[layout.places[s][i]] = point;
    });
    return padded;
  });
}
