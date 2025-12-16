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

export type BoxplotSectionType = typeof BoxplotSection[keyof typeof BoxplotSection];
