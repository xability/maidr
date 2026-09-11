import type { ExtremaTarget } from '@type/extrema';
import type { XValue } from '@type/navigation';
import { t } from '@util/i18n';

/**
 * The label and display parts every min/max target shares.
 *
 * `name` is the extremum in the reader's language, "Max Bar"; `where` is the
 * position it sits at, as the point label reads it. `label` is the sentence
 * joining the two, and `display` carries them apart: the Go To dialog
 * composes its own line from the parts, so nothing has to find the position
 * inside a sentence whose word order is the language's to decide.
 * @param name - The extremum, translated
 * @param where - The x value, or category, it is found at
 * @param y - The row it is found on, for a cell in a grid
 * @returns The `label` and `display` fields of the target
 */
export function extremumAt(
  name: string,
  where: XValue,
  y?: XValue,
): Pick<ExtremaTarget, 'label' | 'display'> {
  const x = String(where);
  if (y === undefined) {
    return { label: t('model.extremaAt', { name, where: x }), display: { name, x } };
  }
  const row = String(y);
  return {
    label: t('model.extremaAt', { name, where: t('model.extremaCell', { x, y: row }) }),
    display: { name, x, y: row },
  };
}
