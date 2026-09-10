import type { MessageKey } from '../index';

export const model = {
  'model.boxSectionLowerOutlier': '하위 이상치',
  'model.boxSectionMin': '최솟값',
  'model.boxSectionQ1': '25%',
  'model.boxSectionQ2': '50%',
  'model.boxSectionQ3': '75%',
  'model.boxSectionMax': '최댓값',
  'model.boxSectionUpperOutlier': '상위 이상치',
  'model.boxSectionMean': '평균',
} satisfies Partial<Record<MessageKey, string>>;
