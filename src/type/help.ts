/**
 * Help menu item containing keyboard shortcut and its description.
 */
export interface HelpMenuItem {
  description: string;
  /** The shortcut as the reader should press it, spelled for the help menu. */
  key: string;
  /**
   * The command this row runs, when the reader may give it a shortcut of
   * their own. Absent on a row that cannot be changed: the help chord
   * itself, and a row reached through a chord such as `l x`, whose first
   * key belongs to another command.
   */
  commandKey?: string;
  /** The shortcut the row has out of the box, for a row the reader changed. */
  defaultKey?: string;
  /** Whether `key` is the reader's own shortcut rather than the default. */
  isCustom?: boolean;
}

/**
 * What a rebinding in the help menu came to, for the dialog to announce.
 */
export interface RebindResult {
  /** Whether the shortcuts changed. */
  changed: boolean;
  /** What to tell the reader, in their language. */
  message: string;
}
