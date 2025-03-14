import type { Keymap } from '@service/keybinding';

export enum Scope {
  CHAT = 'CHAT',
  DEFAULT = 'DEFAULT',
  HELP = 'HELP',
  LABEL = 'LABEL',
  REVIEW = 'REVIEW',
  SETTINGS = 'SETTINGS',
}

export enum CommandCategory {
  AUTOPLAY = 'AUTOPLAY',
  NAVIGATION = 'NAVIGATION',
  DESCRIPTION = 'DESCRIPTION',
  MODE = 'MODE',
  SCOPE = 'SCOPE',
  MISC = 'MISC',
  EMPTY = 'EMPTY',
}

/**
 * Keys is a union of all possible command names
 * Each key has a corresponding handler in CommandFactory
 */
export type Keys =
  | 'ACTIVATE_DEFAULT_SCOPE'
  | 'ACTIVATE_LABEL_SCOPE'
  | 'AUTOPLAY_BACKWARD'
  | 'AUTOPLAY_DOWNWARD'
  | 'AUTOPLAY_FORWARD'
  | 'AUTOPLAY_UPWARD'
  | 'DESCRIBE_CAPTION'
  | 'DESCRIBE_FILL'
  | 'DESCRIBE_POINT'
  | 'DESCRIBE_SUBTITLE'
  | 'DESCRIBE_TITLE'
  | 'DESCRIBE_X'
  | 'DESCRIBE_Y'
  | 'MOVE_DOWN'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'MOVE_TO_BOTTOM_EXTREME'
  | 'MOVE_TO_LEFT_EXTREME'
  | 'MOVE_TO_RIGHT_EXTREME'
  | 'MOVE_TO_TOP_EXTREME'
  | 'MOVE_UP'
  | 'PLAY_AUDIO_LEGEND'  // Added new command for audio legend
  | 'RESET_AUTOPLAY_SPEED'
  | 'SPEED_DOWN_AUTOPLAY'
  | 'SPEED_UP_AUTOPLAY'
  | 'STOP_AUTOPLAY'
  | 'TOGGLE_AUDIO'
  | 'TOGGLE_BRAILLE'
  | 'TOGGLE_CHAT'
  | 'TOGGLE_HELP'
  | 'TOGGLE_REVIEW'
  | 'TOGGLE_SCATTER_NAVIGATION'
  | 'TOGGLE_SETTINGS'
  | 'TOGGLE_TEXT';
