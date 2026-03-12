/**
 * Constant object defining all boxplot sections with their human-readable labels.
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
