import type { MessageKey } from '@util/i18n';
import { t } from '@util/i18n';

/**
 * Constant object defining all boxplot sections.
 *
 * The values are the sections' stable identities — the trace lays its rows out
 * along them and the live data service looks one up by name — and they double
 * as the English labels. What a reader is told is {@link boxSectionLabel},
 * which is the same words in English and the translated ones elsewhere, so a
 * language change never moves a section.
 */
export const BoxplotSection = {
  LOWER_OUTLIER: 'Lower outlier(s)',
  MIN: 'Minimum',
  Q1: '25%',
  Q2: '50%',
  Q3: '75%',
  MAX: 'Maximum',
  UPPER_OUTLIER: 'Upper outlier(s)',
  MEAN: 'Mean',
} as const;

/**
 * Type representing any valid boxplot section label.
 */
export type BoxplotSectionType = typeof BoxplotSection[keyof typeof BoxplotSection];

/** How each section is named to the reader. */
const SECTION_LABEL: Record<BoxplotSectionType, MessageKey> = {
  [BoxplotSection.LOWER_OUTLIER]: 'model.boxSectionLowerOutlier',
  [BoxplotSection.MIN]: 'model.boxSectionMin',
  [BoxplotSection.Q1]: 'model.boxSectionQ1',
  [BoxplotSection.Q2]: 'model.boxSectionQ2',
  [BoxplotSection.Q3]: 'model.boxSectionQ3',
  [BoxplotSection.MAX]: 'model.boxSectionMax',
  [BoxplotSection.UPPER_OUTLIER]: 'model.boxSectionUpperOutlier',
  [BoxplotSection.MEAN]: 'model.boxSectionMean',
};

/**
 * The reader's name for a box plot section.
 *
 * Resolved per call rather than held in a table of strings, so a section
 * announced after a language change is announced in the new language.
 *
 * @param section - The section's identity
 * @returns Its label in the active language
 */
export function boxSectionLabel(section: BoxplotSectionType): string {
  return t(SECTION_LABEL[section]);
}
