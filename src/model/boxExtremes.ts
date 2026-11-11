import type { ExtremaTarget } from '@type/extrema';
import type { BoxPoint } from '@type/grammar';
import type { DescriptionState } from '@type/state';
import type { MessageKey } from '@util/i18n';
import { BoxplotSection } from '@type/boxplotSection';
import { defaultFormat } from '@util/format';
import { t } from '@util/i18n';
import { MathUtil } from '@util/math';
import { extremumAt } from './extremaTarget';

/**
 * Labels for a range row, one for each shape the summary can take.
 */
interface ExtremeLabels {
  /** Used when the chart holds a single box. */
  single: MessageKey;
  /** Used when the chart holds several boxes. */
  grouped: MessageKey;
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
 * the ordinary case, so every group holding the winning value is named, in
 * navigation order. Naming only the first told the reader that one group had
 * the lowest median when two did. An unnamed group among them is named by its
 * position, as the data table names it; when none of them has a name, the
 * value is reported bare.
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
  const label = t(grouped ? labels.grouped : labels.single);

  const measured = points.filter(point => Number.isFinite(valueOf(point)));
  if (measured.length === 0) {
    return { label, value: t('common.missing') };
  }

  const winner = measured.reduce((best, point) =>
    beats(valueOf(point), valueOf(best)) ? point : best,
  );
  const value = valueOf(winner);
  const holders = measured.filter(point => valueOf(point) === value);
  if (!grouped || holders.every(point => groupName(point) === null)) {
    // A bare number travels on for DescriptionService to round.
    return { label, value };
  }
  const name = holders
    .map(point => groupNameAt(points, points.indexOf(point)))
    .join(', ');
  // Composing the group names onto the value makes this a string, past the
  // point where the service can round what is inside it, so the number is
  // rounded here with the same `defaultFormat` the service would have used.
  return {
    label,
    value: t('model.extremeValueWithGroup', { value: defaultFormat(value), name }),
  };
}

/**
 * Reads the name to print next to a group's value, or null when it has none.
 *
 * `BoxPoint.z` is typed as a string, but not every producer fills it — the
 * violin layers carry their group under `fill` and leave `z` undefined at
 * runtime, which is why their data table shows a blank Group column. Reading
 * out "326 (undefined)" is worse than reading out "326", so an unnamed group
 * falls back to the bare value.
 *
 * The name comes back trimmed, since that is the form the blank check judges
 * it by: padding is not part of the name, and announcing "326 (  Group 1  )"
 * would read the padding out as a pause.
 *
 * @param point - The group whose name is being printed.
 * @returns The trimmed name, or null when the group is unnamed or blank.
 */
export function groupName(point: BoxPoint): string | null {
  const name = (point.z ?? point.fill) as string | undefined;
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * What a box-shaped group is called in a description's data table.
 *
 * The authored name where there is one, and a positional fallback where there
 * is not -- an unnamed group used to put `undefined` in the cell, which the
 * dialog blanks, so the whole column came out empty with nothing to say which
 * row was which. `fill` is read alongside `z` for the reason
 * {@link BoxPoint.fill} gives.
 *
 * @param points - The trace's groups, in navigation order.
 * @param index - Which group.
 * @param noun - What one of these is called, for the fallback.
 * @returns The group's name.
 */
export function groupNameAt(
  points: BoxPoint[],
  index: number,
  noun: MessageKey = 'model.nounGroup',
): string {
  const point = points[index];
  const name = point === undefined ? null : groupName(point);
  return name ?? t('model.fallbackNumbered', { noun: t(noun), index: index + 1 });
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

/**
 * The groups holding the extreme of one whisker end, as `[`, `]` and the Go
 * To dialog offer them: every group whose maximum is the highest, or whose
 * minimum is the lowest.
 *
 * The whisker ends the description's range rows name, rather than the
 * outliers past them, so the keys land where the description says the
 * extreme is; the outliers are a step further along the same box. Every
 * group holding the value, within a billionth of the layer's range, is
 * offered, in navigation order, so a tie is walked. A whisker end that is a
 * gap is never one.
 *
 * @param points - The trace's groups, in navigation order.
 * @param end - Which whisker end: `max` for the highest maximum, `min` for
 *   the lowest minimum.
 * @param name - The extremum as the reader hears it, e.g. "Highest maximum".
 * @param noun - What an unnamed group is called, for its positional name.
 * @param cellOf - The row and column of a group's whisker end in the
 *   trace's grid.
 * @param span - The layer's range, which two ends within a billionth of are
 *   one value (`MathUtil.nearlyEqualInRange`).
 * @returns The targets, or none when no group has a measured end.
 */
export function whiskerEndTargets(
  points: BoxPoint[],
  end: 'min' | 'max',
  name: string,
  noun: MessageKey,
  cellOf: (group: number) => [row: number, col: number],
  span: number,
): ExtremaTarget[] {
  const ends = points
    .map((point, group) => ({ group, value: end === 'max' ? point.max : point.min }))
    .filter(({ value }) => Number.isFinite(value));
  if (ends.length === 0) {
    return [];
  }

  const values = ends.map(({ value }) => value);
  const extreme = end === 'max' ? MathUtil.safeMax(values) : MathUtil.safeMin(values);
  return ends
    .filter(({ value }) => MathUtil.nearlyEqualInRange(value, extreme, span))
    .map(({ group, value }) => {
      const [row, col] = cellOf(group);
      const authored = groupName(points[group]);
      return {
        ...extremumAt(name, authored ?? groupNameAt(points, group, noun)),
        value,
        pointIndex: col,
        segment: end === 'max' ? BoxplotSection.MAX : BoxplotSection.MIN,
        type: end,
        groupIndex: row,
        categoryIndex: col,
        navigationType: 'group',
        // The authored name, so the Go To dialog writes it with the category
        // axis's format, as the landing announces it. A positional fallback
        // is not a value of that axis, and carries none.
        xValue: authored ?? undefined,
      };
    });
}
