import type { BoxPoint } from '@type/grammar';
import type { DescriptionState } from '@type/state';

/**
 * Labels for a range row, one for each shape the summary can take.
 */
interface ExtremeLabels {
  /** Used when the chart holds a single box. */
  single: string;
  /** Used when the chart holds several boxes. */
  grouped: string;
}

/**
 * Builds one range row of a box-shaped trace's description summary: the winning
 * value across groups, named with the group it belongs to once there is more
 * than one group to tell apart.
 *
 * Every box carries its own ends, so a single chart-wide pair reads as though a
 * chart of several boxes had one minimum and one maximum. Attributing each
 * extreme to its group is what makes the summary answer "which box?" — the
 * per-group breakdown itself is left to the data table below it.
 *
 * Both halves of the row — which label to use and whether the value carries a
 * group name — hang off the one `grouped` check here, so a row can never pair a
 * lone-group label with a group-suffixed value.
 *
 * Boxes tie on an end readily, several bottoming out at the same floor being
 * the ordinary case, and `beats` is strict, so the earliest group in navigation
 * order wins: the group named is the first one the user reaches.
 *
 * @param points - The trace's groups, in navigation order.
 * @param labels - Row label for the one-group and the several-group case.
 * @param labels.single - Label used when the chart holds a single box.
 * @param labels.grouped - Label used when the chart holds several boxes.
 * @param valueOf - Reads the value being compared from a group.
 * @param beats - True when the candidate value outranks the current winner.
 * @returns The summary row, or a `missing` row when no group has the value.
 */
export function extremeStat(
  points: BoxPoint[],
  labels: ExtremeLabels,
  valueOf: (point: BoxPoint) => number,
  beats: (candidate: number, current: number) => boolean,
): DescriptionState['stats'][number] {
  const grouped = points.length > 1;
  const label = grouped ? labels.grouped : labels.single;

  const measured = points.filter(point => Number.isFinite(valueOf(point)));
  if (measured.length === 0) {
    return { label, value: 'missing' };
  }

  const winner = measured.reduce((best, point) =>
    beats(valueOf(point), valueOf(best)) ? point : best,
  );
  const value = valueOf(winner);
  return {
    label,
    value: grouped && hasName(winner) ? `${value} (${winner.z})` : value,
  };
}

/**
 * True when a group carries a name worth printing next to its value.
 *
 * `BoxPoint.z` is typed as a string, but not every producer fills it — the
 * violin layers carry their group under `fill` and leave `z` undefined at
 * runtime, which is why their data table shows a blank Group column. Reading
 * out "326 (undefined)" is worse than reading out "326", so an unnamed group
 * falls back to the bare value.
 *
 * @param point - The group whose name is being printed.
 * @returns True when the group has a non-blank name.
 */
function hasName(point: BoxPoint): boolean {
  const name = point.z as string | undefined;
  return typeof name === 'string' && name.trim() !== '';
}

/**
 * Reads the lowest of a value across groups — the `beats` rule for a minimum.
 *
 * @param candidate - The value under consideration.
 * @param current - The current winner's value.
 * @returns True when the candidate is lower.
 */
export function isLower(candidate: number, current: number): boolean {
  return candidate < current;
}

/**
 * Reads the highest of a value across groups — the `beats` rule for a maximum.
 *
 * @param candidate - The value under consideration.
 * @param current - The current winner's value.
 * @returns True when the candidate is higher.
 */
export function isHigher(candidate: number, current: number): boolean {
  return candidate > current;
}
