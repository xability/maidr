import type { MessageKey } from '@util/i18n';

/**
 * The groups the help menu sorts its shortcuts into, in the order it lists
 * them: roughly the order a reader reaches for them. Moving around and
 * hearing where you are come first because every session is made of them;
 * the modes are set once or twice a session; autoplay and the jumps are for
 * a reader who already knows the basics; the dialogs, and the keys that only
 * one kind of chart or device answers to, come last.
 */
export const HELP_SECTIONS = [
  'navigate',
  'hear',
  'modes',
  'autoplay',
  'jump',
  'tools',
  'candlestick',
  'tactile',
  'other',
] as const;

export type HelpSectionId = (typeof HELP_SECTIONS)[number];

/** The heading each group is shown under. */
export const HELP_SECTION_TITLES: Readonly<Record<HelpSectionId, MessageKey>> = {
  navigate: 'keybinding.helpSectionNavigate',
  hear: 'keybinding.helpSectionHear',
  modes: 'keybinding.helpSectionModes',
  autoplay: 'keybinding.helpSectionAutoplay',
  jump: 'keybinding.helpSectionJump',
  tools: 'keybinding.helpSectionTools',
  candlestick: 'keybinding.helpSectionCandlestick',
  tactile: 'keybinding.helpSectionTactile',
  other: 'keybinding.helpSectionOther',
};

/**
 * Help menu item containing keyboard shortcut and its description.
 */
export interface HelpMenuItem {
  description: string;
  /** The group the row is listed under. */
  section: HelpSectionId;
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
