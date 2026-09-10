/**
 * Messages spoken by the model layer: section names, statistic labels, and
 * the chart type names the description dialog and announcements use.
 */
export const model = {
  // Box plot sections (src/type/boxplotSection.ts); the text service compares
  // against these to recognise the outlier sections.
  'model.boxSectionLowerOutlier': 'Lower outlier(s)',
  'model.boxSectionMin': 'Minimum',
  'model.boxSectionQ1': '25%',
  'model.boxSectionQ2': '50%',
  'model.boxSectionQ3': '75%',
  'model.boxSectionMax': 'Maximum',
  'model.boxSectionUpperOutlier': 'Upper outlier(s)',
  'model.boxSectionMean': 'Mean',
} as const;
