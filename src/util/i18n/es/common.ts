import type { MessageKey } from '../index';

/** Spanish renderings of the words shared by more than one area of the code. */
export const common = {
  /** How an absent value is named wherever a trace has nothing to report. */
  'common.missing': 'ausente',
} satisfies Partial<Record<MessageKey, string>>;
