import type { CommandContext } from '@command/command';
import type { DisplayService } from '@service/display';
import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { KeybindingEntry, Keys } from '@type/event';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import type { MessageKey } from '@util/i18n';
import { CommandFactory } from '@command/factory';
import { InvalidKeyCommand } from '@command/invalidKey';
import { PointerGuidanceCommand } from '@command/pointerGuidance';
import { Scope } from '@type/event';
import { Constant } from '@util/constant';
import { combosOf, formatCombo, normalizeCombo } from '@util/keyCombo';
import { Platform } from '@util/platform';
import hotkeys from 'hotkeys-js';

/**
 * Helper to create a keybinding entry with required fields.
 *
 * The description is a message key rather than the text itself: the help menu
 * and the command palette resolve it with `t()` as they build their lists, so
 * a language change is reflected the next time either one opens.
 */
function key(hotkey: string, description: MessageKey, options?: Partial<KeybindingEntry>): KeybindingEntry {
  return {
    hotkey,
    description,
    ...options,
  };
}

/**
 * The chord that opens the help menu, and the mark of a scope that can point a
 * reader at it.
 *
 * Named rather than repeated so the two uses cannot drift apart: the scopes
 * below bind it, and {@link KeybindingService.warnOnUnassignedKeys} advertises
 * it only where it is bound. Rebinding help here moves both at once.
 */
const HELP_CHORD = `${Platform.ctrl}+/`;

/**
 * Tactile display bindings, shared by every scope the display can be up in.
 *
 * Braille scope, and the trace and subplot scopes too. The display comes up
 * wherever the reader asks for it, and braille cannot open on every plot type
 * — a scatter has no braille table. Binding these in braille scope alone left
 * the zoom dead on exactly the charts the display had just been unlocked for,
 * and on the multi-panel lobby, where pressing them did nothing and said
 * nothing.
 *
 * Bare keys rather than a Ctrl chord, deliberately. Ctrl and plus/minus is
 * the browser's own page zoom, and the reader most likely to want it is a
 * low-vision reader -- who is also the one most likely to be in braille
 * mode. Taking that chord would make the two zooms compete for one gesture;
 * leaving it alone lets a reader enlarge the page and the pin view
 * independently, which is the point.
 *
 * Zoom in is `=`, the unshifted key the `+` legend sits on, so neither
 * direction needs a modifier -- pressing shift for one of a matched pair is
 * the kind of asymmetry a hand notices. `shift+=` and the keypad stay bound
 * as well, since a reader who reaches for the `+` they can see should not
 * find it dead.
 *
 * `0` for the whole plot, on the reasoning that reads on a keyboard: the
 * digit row runs `1` upwards through the zoom levels a reader might imagine,
 * and `0` is the one before them. Stepping back out is seven presses from
 * the closest zoom -- each a frame the device has to be waited on -- so this
 * is not a shortcut for a thing that was already quick.
 */
const TACTILE_KEYMAP = {
  TACTILE_ZOOM_IN: key(
    `=, shift+=, num_add`,
    'keybinding.zoomInTactileDisplay',
    { helpKey: '=' },
  ),
  TACTILE_ZOOM_OUT: key(
    `-, num_subtract`,
    'keybinding.zoomOutTactileDisplay',
    { helpKey: '-' },
  ),
  TACTILE_RESET_ZOOM: key(
    `0, num_0`,
    'keybinding.resetTactileDisplayZoom',
    { helpKey: '0' },
  ),
} as const;

/**
 * Keymap configuration for braille mode interactions.
 */
const BRAILLE_KEYMAP = {
  ACTIVATE_TRACE_LABEL_SCOPE: key(`l`, 'keybinding.accessLabels', { showInHelp: false }),
  EXIT_BRAILLE_AND_SUBPLOT: key(`esc`, 'keybinding.exitBrailleMode', { showInHelp: false }),

  // Autoplay
  AUTOPLAY_UPWARD: key(`${Platform.ctrl}+shift+up`, 'keybinding.autoplayUpward', { helpKey: `${Platform.ctrl} + shift + up` }),
  AUTOPLAY_DOWNWARD: key(`${Platform.ctrl}+shift+down`, 'keybinding.autoplayDownward', { helpKey: `${Platform.ctrl} + shift + down` }),
  AUTOPLAY_FORWARD: key(`${Platform.ctrl}+shift+right`, 'keybinding.autoplayForward', { helpKey: `${Platform.ctrl} + shift + right` }),
  AUTOPLAY_BACKWARD: key(`${Platform.ctrl}+shift+left`, 'keybinding.autoplayBackward', { helpKey: `${Platform.ctrl} + shift + left` }),

  STOP_AUTOPLAY: key(`${Platform.ctrl}, up, down, left, right`, 'keybinding.stopAutoplay', { helpKey: `${Platform.ctrl}` }),
  SPEED_UP_AUTOPLAY: key(`.`, 'keybinding.speedUpAutoplay', { helpKey: '. (period)' }),
  SPEED_DOWN_AUTOPLAY: key(`,`, 'keybinding.speedDownAutoplay', { helpKey: ', (comma)' }),
  RESET_AUTOPLAY_SPEED: key(`/`, 'keybinding.resetAutoplaySpeed', { helpKey: '/ (slash)' }),

  ...TACTILE_KEYMAP,

  // Navigation
  MOVE_UP: key(`up`, 'keybinding.navigateUp'),
  MOVE_DOWN: key(`down`, 'keybinding.navigateDown'),
  MOVE_RIGHT: key(`right`, 'keybinding.navigateRight'),
  MOVE_LEFT: key(`left`, 'keybinding.navigateLeft'),

  MOVE_TO_TOP_EXTREME: key(`${Platform.ctrl}+up`, 'keybinding.goToTopExtreme', { helpKey: `${Platform.ctrl} + up` }),
  MOVE_TO_BOTTOM_EXTREME: key(`${Platform.ctrl}+down`, 'keybinding.goToBottomExtreme', { helpKey: `${Platform.ctrl} + down` }),
  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'keybinding.goToLeftExtreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'keybinding.goToRightExtreme', { helpKey: `${Platform.ctrl} + right` }),

  MOVE_TO_NEXT_TRACE: key(`pageup`, 'keybinding.moveToNextLayer'),
  MOVE_TO_PREV_TRACE: key(`pagedown`, 'keybinding.moveToPreviousLayer'),

  // Go To functionality
  // The extrema dialog ('g') is not bound here — a modal would fight the
  // braille text area for focus — but the bracket keys open nothing, so the
  // jump itself is available while reading braille.
  GO_TO_MIN_VALUE: key(`[`, 'keybinding.goToMinimumValue', { helpKey: '[ (open bracket)' }),
  GO_TO_MAX_VALUE: key(`]`, 'keybinding.goToMaximumValue', { helpKey: '] (close bracket)' }),

  // Modes
  TOGGLE_BRAILLE: key(`b`, 'keybinding.toggleBrailleMode'),
  TOGGLE_TEXT: key(`t`, 'keybinding.toggleTextMode'),
  TOGGLE_AUDIO: key(`s`, 'keybinding.toggleSonificationMode'),
  TOGGLE_REVIEW: key(`r`, 'keybinding.toggleReviewMode'),
  TOGGLE_HIGH_CONTRAST: key(`c`, 'keybinding.toggleHighContrastMode'),
  TOGGLE_MONITOR: key(`m`, 'keybinding.toggleMonitorMode'),

  // Misc
  TOGGLE_HELP: key(HELP_CHORD, 'keybinding.openCloseHelp', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'keybinding.openChat', { helpKey: '?' }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'keybinding.openSettings', { helpKey: `${Platform.ctrl} + ,` }),

  // Description
  ANNOUNCE_POINT: key(`space`, 'keybinding.replayCurrentPoint'),
  ANNOUNCE_POSITION: key(`p`, 'keybinding.announcePosition'),

  // Chart description
  TOGGLE_DESCRIPTION: key(`d`, 'keybinding.openChartDescription'),

  // Go To functionality
  //
  // Bound here as well as in TRACE so jumping to an extremum does not require
  // leaving braille first. The dialog opens on top of the braille scope and
  // GoToExtremaService returns to whichever scope opened it, so braille is
  // still on — and re-rendered at the new cursor — once the dialog closes.
  // `preventDefault` in the hotkeys handler keeps the `g` out of the braille
  // textarea's own value.
  GO_TO_EXTREMA_TOGGLE: key(`g`, 'keybinding.goToExtrema'),

  // rotor functionality
  ROTOR_NEXT_NAV: key(`${Platform.alt}+shift+up`, 'keybinding.nextNavigationMode', { helpKey: `${Platform.alt} + shift + up` }),
  ROTOR_PREV_NAV: key(`${Platform.alt}+shift+down`, 'keybinding.previousNavigationMode', { helpKey: `${Platform.alt} + shift + down` }),
} as const;

/**
 * Keymap configuration for the virtual candlestick delta layer. Mirrors the
 * trace scope minus layer switching (the delta layer is not a subplot layer)
 * and with ESC bound to exiting back to the real chart layer.
 */
const CANDLESTICK_DELTA_KEYMAP = {
  EXIT_CANDLESTICK_DELTA: key(`esc`, 'keybinding.exitComparisonAndReturnToChart'),
  TOGGLE_CANDLESTICK_DELTA_LAYER: key(`${Platform.alt}+l`, 'keybinding.turnOffReferenceComparison', { helpKey: `${Platform.alt} + L` }),
  SELECT_CANDLESTICK_DELTA_REFERENCE: key(`${Platform.ctrl}+shift+l`, 'keybinding.changeReferenceLine', { helpKey: `${Platform.ctrl} + shift + L` }),

  // Label scope ('l') is intentionally NOT bound here: the delta layer's own
  // announcements already spell out the axes, so a separate label mode would
  // be redundant. It used to be unsafe as well — TRACE_LABEL's Escape
  // hard-returned to Scope.TRACE and desynced the keyboard scope from the
  // still-active virtual delta layer — but that no longer holds now that
  // exiting a label scope returns to whichever scope opened it. Binding it
  // here is a design question, not a hazard.

  // Autoplay
  AUTOPLAY_FORWARD: key(`${Platform.ctrl}+shift+right`, 'keybinding.autoplayForward', { helpKey: `${Platform.ctrl} + shift + right` }),
  AUTOPLAY_BACKWARD: key(`${Platform.ctrl}+shift+left`, 'keybinding.autoplayBackward', { helpKey: `${Platform.ctrl} + shift + left` }),

  STOP_AUTOPLAY: key(`${Platform.ctrl}, up, down, left, right`, 'keybinding.stopAutoplay', { helpKey: `${Platform.ctrl}` }),
  SPEED_UP_AUTOPLAY: key(`.`, 'keybinding.speedUpAutoplay', { helpKey: '. (period)' }),
  SPEED_DOWN_AUTOPLAY: key(`,`, 'keybinding.speedDownAutoplay', { helpKey: ', (comma)' }),
  RESET_AUTOPLAY_SPEED: key(`/`, 'keybinding.resetAutoplaySpeed', { helpKey: '/ (slash)' }),

  // Navigation
  MOVE_UP: key(`up`, 'keybinding.navigateUp'),
  MOVE_DOWN: key(`down`, 'keybinding.navigateDown'),
  MOVE_RIGHT: key(`right`, 'keybinding.navigateRight'),
  MOVE_LEFT: key(`left`, 'keybinding.navigateLeft'),

  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'keybinding.goToLeftExtreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'keybinding.goToRightExtreme', { helpKey: `${Platform.ctrl} + right` }),

  // Modes
  TOGGLE_BRAILLE: key(`b`, 'keybinding.toggleBrailleMode'),
  TOGGLE_TEXT: key(`t`, 'keybinding.toggleTextMode'),
  TOGGLE_AUDIO: key(`s`, 'keybinding.toggleSonificationMode'),
  TOGGLE_REVIEW: key(`r`, 'keybinding.toggleReviewMode'),

  // Misc
  TOGGLE_HELP: key(HELP_CHORD, 'keybinding.openCloseHelp', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'keybinding.openChat', { helpKey: '?' }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'keybinding.openSettings', { helpKey: `${Platform.ctrl} + ,` }),

  // Description
  ANNOUNCE_POINT: key(`space`, 'keybinding.replayCurrentPoint'),
  ANNOUNCE_POSITION: key(`p`, 'keybinding.announcePosition'),

  // Go To functionality
  GO_TO_EXTREMA_TOGGLE: key(`g`, 'keybinding.goToExtrema'),
  GO_TO_MIN_VALUE: key(`[`, 'keybinding.goToMinimumValue', { helpKey: '[ (open bracket)' }),
  GO_TO_MAX_VALUE: key(`]`, 'keybinding.goToMaximumValue', { helpKey: '] (close bracket)' }),

  // Chart description
  TOGGLE_DESCRIPTION: key(`d`, 'keybinding.openChartDescription'),

  // rotor functionality
  ROTOR_NEXT_NAV: key(`${Platform.alt}+shift+up`, 'keybinding.nextNavigationMode', { helpKey: `${Platform.alt} + shift + up` }),
  ROTOR_PREV_NAV: key(`${Platform.alt}+shift+down`, 'keybinding.previousNavigationMode', { helpKey: `${Platform.alt} + shift + down` }),
} as const;

/**
 * Keymap configuration for the candlestick delta reference picker (Ctrl+Shift+L).
 */
const CANDLESTICK_DELTA_SETTINGS_KEYMAP = {
  // Reference picker listbox navigation (standard UI, not shown in help)
  CANDLESTICK_DELTA_REF_MOVE_UP: key(`up`, 'keybinding.previousReferenceLine', { showInHelp: false }),
  CANDLESTICK_DELTA_REF_MOVE_DOWN: key(`down`, 'keybinding.nextReferenceLine', { showInHelp: false }),
  CANDLESTICK_DELTA_REF_SELECT: key(`enter`, 'keybinding.selectReferenceLine', { showInHelp: false }),
  CANDLESTICK_DELTA_REF_CLOSE: key(`esc`, 'keybinding.closeReferencePicker', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for chat interface interactions.
 */
const CHAT_KEYMAP = {
  // Misc
  TOGGLE_CHAT: key(`esc`, 'keybinding.closeChat', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for figure label scope interactions.
 */
const FIGURE_LABEL_KEYMAP = {
  DEACTIVATE_FIGURE_LABEL_SCOPE: key(`escape`, 'keybinding.exitLabelMode', { showInHelp: false }),

  // Description
  // Mirrors TRACE_LABEL so the figure lobby exposes the same L-chord labels
  // (l x / l y / l z / l t / l s / l c) as an individual subplot.
  ANNOUNCE_X: key(`x`, 'keybinding.announceXLabel'),
  ANNOUNCE_Y: key(`y`, 'keybinding.announceYLabel'),
  ANNOUNCE_Z: key(`z`, 'keybinding.announceZLabel'),
  ANNOUNCE_TITLE: key(`t`, 'keybinding.announcePlotTitle'),
  ANNOUNCE_SUBTITLE: key(`s`, 'keybinding.announceSubtitle'),
  ANNOUNCE_CAPTION: key(`c`, 'keybinding.announceCaption'),

  // Misc
  TOGGLE_HELP: key(HELP_CHORD, 'keybinding.openCloseHelp', { helpKey: `${Platform.ctrl} + /` }),
} as const;

/**
 * Keymap configuration for help menu interactions.
 */
const HELP_KEYMAP = {
  // Misc
  TOGGLE_HELP: key(`esc`, 'keybinding.closeHelp', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for subplot scope interactions.
 */
const SUBPLOT_KEYMAP = {
  ...TACTILE_KEYMAP,
  ACTIVATE_FIGURE_LABEL_SCOPE: key(`l`, 'keybinding.accessLabels', { showInHelp: false }),

  // Description
  // Title / subtitle / caption / axis labels are reached through the label
  // scope (l t / l x / l y / l z / l s / l c), not a bare key — mirroring trace
  // scope, where a bare 't' is TOGGLE_TEXT (below) rather than the title.
  ANNOUNCE_POINT: key(`space`, 'keybinding.announceCurrentSubplot'),
  ANNOUNCE_POSITION: key(`p`, 'keybinding.announcePosition'),

  // Chart description
  TOGGLE_DESCRIPTION: key(`d`, 'keybinding.openChartDescription'),

  // Navigation
  MOVE_UP: key(`up`, 'keybinding.moveUp'),
  MOVE_DOWN: key(`down`, 'keybinding.moveDown'),
  MOVE_RIGHT: key(`right`, 'keybinding.moveRight'),
  MOVE_LEFT: key(`left`, 'keybinding.moveLeft'),

  MOVE_TO_TOP_EXTREME: key(`${Platform.ctrl}+up`, 'keybinding.goToTopExtreme', { helpKey: `${Platform.ctrl} + up` }),
  MOVE_TO_BOTTOM_EXTREME: key(`${Platform.ctrl}+down`, 'keybinding.goToBottomExtreme', { helpKey: `${Platform.ctrl} + down` }),
  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'keybinding.goToLeftExtreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'keybinding.goToRightExtreme', { helpKey: `${Platform.ctrl} + right` }),

  MOVE_TO_TRACE_CONTEXT: key(`${Platform.enter}`, 'keybinding.activateCurrentSubplot', { helpKey: `${Platform.enter}` }),

  // Modes
  // Text and sonification toggles work at the lobby (they are global modes).
  // Braille has no figure-level meaning, so pressing it here announces a
  // "not available" warning (see ToggleBrailleCommand) rather than doing nothing.
  TOGGLE_TEXT: key(`t`, 'keybinding.toggleTextMode'),
  TOGGLE_AUDIO: key(`s`, 'keybinding.toggleSonificationMode'),
  TOGGLE_BRAILLE: key(`b`, 'keybinding.toggleBrailleMode'),
  TOGGLE_REVIEW: key(`r`, 'keybinding.toggleReviewMode'),
  TOGGLE_HIGH_CONTRAST: key(`c`, 'keybinding.toggleHighContrastMode'),
  TOGGLE_MONITOR: key(`m`, 'keybinding.toggleMonitorMode'),

  // Misc
  TOGGLE_HELP: key(HELP_CHORD, 'keybinding.openCloseHelp', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'keybinding.openChat', { helpKey: '?' }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'keybinding.openSettings', { helpKey: `${Platform.ctrl} + ,` }),
} as const;

/**
 * Keymap configuration for trace label scope interactions.
 */
const TRACE_LABEL_KEYMAP = {
  DEACTIVATE_TRACE_LABEL_SCOPE: key(`escape`, 'keybinding.exitLabelMode', { showInHelp: false }),

  // Description
  ANNOUNCE_X: key(`x`, 'keybinding.announceXLabel'),
  ANNOUNCE_Y: key(`y`, 'keybinding.announceYLabel'),
  ANNOUNCE_Z: key(`z`, 'keybinding.announceZLabel'),
  ANNOUNCE_TITLE: key(`t`, 'keybinding.announcePlotTitle'),
  ANNOUNCE_SUBTITLE: key(`s`, 'keybinding.announceSubtitle'),
  ANNOUNCE_CAPTION: key(`c`, 'keybinding.announceCaption'),

  // Misc
  TOGGLE_HELP: key(HELP_CHORD, 'keybinding.openCloseHelp', { helpKey: `${Platform.ctrl} + /` }),
} as const;

/**
 * Keymap configuration for review mode interactions.
 */
const REVIEW_KEYMAP = {
  // Modes
  TOGGLE_BRAILLE: key(`b`, 'keybinding.toggleBrailleMode'),
  TOGGLE_REVIEW: key(`r`, 'keybinding.exitReviewMode'),

  // Allowed actions
  ALLOW_DEFAULT: key(`up, down, left, right,
    ${Platform.ctrl}+up, ${Platform.ctrl}+down,
    ${Platform.ctrl}+left, ${Platform.ctrl}+right,
    pageup, pagedown, home, end,
    tab, ${Platform.ctrl}+a, ${Platform.ctrl}+c`, 'keybinding.standardTextSelection', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for settings interface interactions.
 *
 * Deliberately empty. The settings dialog is a MUI Modal, and MUI calls
 * `stopPropagation()` on the Escape keydown before it reaches the
 * document-level hotkeys-js listener, so a binding registered here could never
 * fire. Escape is handled by the dialog's own `onClose`
 * (see `src/ui/component/Settings.tsx`). The scope still matters — it keeps
 * chart shortcuts from firing while the dialog is open.
 */
const SETTINGS_KEYMAP = {} as const;

/**
 * Keymap configuration for trace scope interactions and navigation.
 */
const TRACE_KEYMAP = {
  ...TACTILE_KEYMAP,
  ACTIVATE_TRACE_LABEL_SCOPE: key(`l`, 'keybinding.accessLabels', { showInHelp: false }),

  // Autoplay
  AUTOPLAY_UPWARD: key(`${Platform.ctrl}+shift+up`, 'keybinding.autoplayUpward', { helpKey: `${Platform.ctrl} + shift + up` }),
  AUTOPLAY_DOWNWARD: key(`${Platform.ctrl}+shift+down`, 'keybinding.autoplayDownward', { helpKey: `${Platform.ctrl} + shift + down` }),
  AUTOPLAY_FORWARD: key(`${Platform.ctrl}+shift+right`, 'keybinding.autoplayForward', { helpKey: `${Platform.ctrl} + shift + right` }),
  AUTOPLAY_BACKWARD: key(`${Platform.ctrl}+shift+left`, 'keybinding.autoplayBackward', { helpKey: `${Platform.ctrl} + shift + left` }),

  STOP_AUTOPLAY: key(`${Platform.ctrl}, up, down, left, right`, 'keybinding.stopAutoplay', { helpKey: `${Platform.ctrl}` }),
  SPEED_UP_AUTOPLAY: key(`.`, 'keybinding.speedUpAutoplay', { helpKey: '. (period)' }),
  SPEED_DOWN_AUTOPLAY: key(`,`, 'keybinding.speedDownAutoplay', { helpKey: ', (comma)' }),
  RESET_AUTOPLAY_SPEED: key(`/`, 'keybinding.resetAutoplaySpeed', { helpKey: '/ (slash)' }),

  // Navigation
  MOVE_UP: key(`up`, 'keybinding.navigateUp'),
  MOVE_DOWN: key(`down`, 'keybinding.navigateDown'),
  MOVE_RIGHT: key(`right`, 'keybinding.navigateRight'),
  MOVE_LEFT: key(`left`, 'keybinding.navigateLeft'),

  MOVE_TO_TOP_EXTREME: key(`${Platform.ctrl}+up`, 'keybinding.goToTopExtreme', { helpKey: `${Platform.ctrl} + up` }),
  MOVE_TO_BOTTOM_EXTREME: key(`${Platform.ctrl}+down`, 'keybinding.goToBottomExtreme', { helpKey: `${Platform.ctrl} + down` }),
  MOVE_TO_LEFT_EXTREME: key(`${Platform.ctrl}+left`, 'keybinding.goToLeftExtreme', { helpKey: `${Platform.ctrl} + left` }),
  MOVE_TO_RIGHT_EXTREME: key(`${Platform.ctrl}+right`, 'keybinding.goToRightExtreme', { helpKey: `${Platform.ctrl} + right` }),

  // `backspace` is an alternate to `esc` for returning from a subplot to the
  // multi-panel figure lobby. It is bound only in TRACE scope (never in the
  // braille/review text areas, which the hotkeys filter allow-lists), so it
  // never collides with the text-delete meaning of Backspace inside an editable
  // field — it only acts as a "navigate back" key while reading a chart.
  MOVE_TO_SUBPLOT_CONTEXT: key(`esc,backspace`, 'keybinding.returnToSubplot', { showInHelp: false }),
  MOVE_TO_NEXT_TRACE: key(`pageup`, 'keybinding.moveToNextLayer'),
  MOVE_TO_PREV_TRACE: key(`pagedown`, 'keybinding.moveToPreviousLayer'),

  // Modes
  TOGGLE_BRAILLE: key(`b`, 'keybinding.toggleBrailleMode'),
  TOGGLE_TEXT: key(`t`, 'keybinding.toggleTextMode'),
  TOGGLE_AUDIO: key(`s`, 'keybinding.toggleSonificationMode'),
  TOGGLE_REVIEW: key(`r`, 'keybinding.toggleReviewMode'),
  TOGGLE_HIGH_CONTRAST: key(`c`, 'keybinding.toggleHighContrastMode'),
  TOGGLE_MONITOR: key(`m`, 'keybinding.toggleMonitorMode'),

  // Misc
  TOGGLE_HELP: key(HELP_CHORD, 'keybinding.openCloseHelp', { helpKey: `${Platform.ctrl} + /` }),
  TOGGLE_CHAT: key(`shift+/`, 'keybinding.openChat', { helpKey: '?' }),
  TOGGLE_COMMAND_PALETTE: key(`${Platform.ctrl}+shift+p`, 'keybinding.openCommandPalette', { helpKey: `${Platform.ctrl} + shift + p` }),
  TOGGLE_SETTINGS: key(`${Platform.ctrl}+,`, 'keybinding.openSettings', { helpKey: `${Platform.ctrl} + ,` }),

  // Description
  ANNOUNCE_POINT: key(`space`, 'keybinding.replayCurrentPoint'),
  ANNOUNCE_POSITION: key(`p`, 'keybinding.announcePosition'),

  // Go To functionality
  GO_TO_EXTREMA_TOGGLE: key(`g`, 'keybinding.goToExtrema'),
  GO_TO_MIN_VALUE: key(`[`, 'keybinding.goToMinimumValue', { helpKey: '[ (open bracket)' }),
  GO_TO_MAX_VALUE: key(`]`, 'keybinding.goToMaximumValue', { helpKey: '] (close bracket)' }),

  // Chart description
  TOGGLE_DESCRIPTION: key(`d`, 'keybinding.openChartDescription'),

  // Candlestick reference comparison (virtual delta layer)
  TOGGLE_CANDLESTICK_DELTA_LAYER: key(`${Platform.alt}+l`, 'keybinding.toggleCandlestickReferenceComparison', { helpKey: `${Platform.alt} + L` }),
  SELECT_CANDLESTICK_DELTA_REFERENCE: key(`${Platform.ctrl}+shift+l`, 'keybinding.chooseCandlestickReferenceLine', { helpKey: `${Platform.ctrl} + shift + L` }),

  // rotor functionality
  ROTOR_NEXT_NAV: key(`${Platform.alt}+shift+up`, 'keybinding.nextNavigationMode', { helpKey: `${Platform.alt} + shift + up` }),
  ROTOR_PREV_NAV: key(`${Platform.alt}+shift+down`, 'keybinding.previousNavigationMode', { helpKey: `${Platform.alt} + shift + down` }),

  // Grid cell navigation (enter grid cell when in GRID_MODE)
  ENTER_GRID_CELL: key(`${Platform.enter}`, 'keybinding.enterGridCell', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for extrema navigation modal interactions.
 */
const GO_TO_EXTREMA_KEYMAP = {
  // Navigation within the modal (standard UI, not shown in help)
  GO_TO_EXTREMA_MOVE_UP: key('up', 'keybinding.navigateUp', { showInHelp: false }),
  GO_TO_EXTREMA_MOVE_DOWN: key('down', 'keybinding.navigateDown', { showInHelp: false }),
  GO_TO_EXTREMA_SELECT: key('enter', 'keybinding.select', { showInHelp: false }),
  GO_TO_EXTREMA_CLOSE: key('esc', 'keybinding.close', { showInHelp: false }),
  GO_TO_EXTREMA_TOGGLE: key('g', 'keybinding.goToExtrema', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for chart description modal interactions.
 */
const DESCRIPTION_KEYMAP = {
  TOGGLE_DESCRIPTION: key(`esc`, 'keybinding.closeChartDescription', { showInHelp: false }),

  // The layer tab strip's own keys -- left/right along the strip, Space to
  // confirm -- are handled by the strip itself rather than bound here.
  //
  // A scoped binding fires wherever focus is in the dialog and is
  // `preventDefault`ed before its command runs, so claiming these three would
  // have taken Space off the data table's scroll region and the Close button,
  // and taken the arrows off every other focusable thing in the dialog --
  // paying for a strip most charts do not even have. The strip has focus
  // whenever those keys mean anything, so handling them there costs nothing
  // and takes nothing. Escape is still bound, and the strip does not stop the
  // event, so it keeps reaching this scope.
} as const;

/**
 * Keymap configuration for command palette modal interactions.
 */
const COMMAND_PALETTE_KEYMAP = {
  // Navigation within the modal (standard UI, not shown in help)
  COMMAND_PALETTE_MOVE_UP: key('up', 'keybinding.navigateUp', { showInHelp: false }),
  COMMAND_PALETTE_MOVE_DOWN: key('down', 'keybinding.navigateDown', { showInHelp: false }),
  COMMAND_PALETTE_SELECT: key('enter', 'keybinding.select', { showInHelp: false }),
  COMMAND_PALETTE_CLOSE: key('esc', 'keybinding.close', { showInHelp: false }),
} as const;

/**
 * Keymap configuration for grid cell point navigation.
 */
const GRID_CELL_KEYMAP = {
  // Navigation within grid cell points
  GRID_CELL_MOVE_LEFT: key('left', 'keybinding.navigateLeftInCell', { showInHelp: false }),
  GRID_CELL_MOVE_RIGHT: key('right', 'keybinding.navigateRightInCell', { showInHelp: false }),
  EXIT_GRID_CELL: key('esc', 'keybinding.exitGridCell', { showInHelp: false }),

  // Sweeping a dense cell is the whole reason for entering one, so autoplay
  // has to be reachable here. Horizontal only: a cell's points are one list,
  // and up/down are not bound above either.
  AUTOPLAY_FORWARD: key(`${Platform.ctrl}+shift+right`, 'keybinding.autoplayForward', { helpKey: `${Platform.ctrl} + shift + right` }),
  AUTOPLAY_BACKWARD: key(`${Platform.ctrl}+shift+left`, 'keybinding.autoplayBackward', { helpKey: `${Platform.ctrl} + shift + left` }),
  STOP_AUTOPLAY: key(`${Platform.ctrl}, left, right`, 'keybinding.stopAutoplay', { helpKey: `${Platform.ctrl}` }),
  SPEED_UP_AUTOPLAY: key(`.`, 'keybinding.speedUpAutoplay', { helpKey: '. (period)' }),
  SPEED_DOWN_AUTOPLAY: key(`,`, 'keybinding.speedDownAutoplay', { helpKey: ', (comma)' }),
  RESET_AUTOPLAY_SPEED: key(`/`, 'keybinding.resetAutoplaySpeed', { helpKey: '/ (slash)' }),
} as const;

/**
 * Maps each application scope to its corresponding keymap configuration.
 */
export const SCOPED_KEYMAP = {
  [Scope.BRAILLE]: BRAILLE_KEYMAP,
  [Scope.CANDLESTICK_DELTA]: CANDLESTICK_DELTA_KEYMAP,
  [Scope.CANDLESTICK_DELTA_SETTINGS]: CANDLESTICK_DELTA_SETTINGS_KEYMAP,
  [Scope.CHAT]: CHAT_KEYMAP,
  [Scope.COMMAND_PALETTE]: COMMAND_PALETTE_KEYMAP,
  [Scope.DESCRIPTION]: DESCRIPTION_KEYMAP,
  [Scope.FIGURE_LABEL]: FIGURE_LABEL_KEYMAP,
  [Scope.GO_TO_EXTREMA]: GO_TO_EXTREMA_KEYMAP,
  [Scope.GRID_CELL]: GRID_CELL_KEYMAP,
  [Scope.HELP]: HELP_KEYMAP,
  [Scope.REVIEW]: REVIEW_KEYMAP,
  [Scope.SETTINGS]: SETTINGS_KEYMAP,
  [Scope.SUBPLOT]: SUBPLOT_KEYMAP,
  [Scope.TRACE]: TRACE_KEYMAP,
  [Scope.TRACE_LABEL]: TRACE_LABEL_KEYMAP,
} as const;

/**
 * Type representing a scope's keymap (command key to keybinding entry mapping).
 */
export type ScopeKeymap = Record<string, KeybindingEntry>;

/**
 * Type representing the complete keymap structure for all scopes.
 */
export type Keymap = {
  [K in Scope]: (typeof SCOPED_KEYMAP)[K];
};

/**
 * Shortcuts a reader has changed, keyed by command: the value of
 * `settings.general.keybindings`, once {@link resolveOverrides} has
 * discarded anything that is not a command with a shortcut of its own.
 */
export type KeybindingOverrides = Readonly<Record<string, string>>;

/**
 * Commands a reader may not rebind.
 *
 * The help chord is the way back to the list of shortcuts, and the warning
 * an unassigned key gives spells that chord out in words -- a reader who
 * moved it and forgot where would be told to press a key that no longer
 * opens anything. `ALLOW_DEFAULT` is the browser's own behaviour, not a
 * shortcut. `STOP_AUTOPLAY` is bound through a wildcard handler that fires
 * on a bare modifier press (see {@link KeybindingService.bindAll}), which
 * no override reaches: offering it as movable would list a new key while
 * the old one kept working.
 */
const FIXED_COMMANDS: ReadonlySet<string> = new Set(['TOGGLE_HELP', 'ALLOW_DEFAULT', 'STOP_AUTOPLAY']);

/**
 * Every command name a keymap binds, with the scopes that bind it.
 *
 * Computed once: the keymaps are module constants, so the answer never
 * changes, and both the conflict check and the help menu ask it per row.
 */
const SCOPES_BY_COMMAND: ReadonlyMap<string, readonly Scope[]> = (() => {
  const map = new Map<string, Scope[]>();
  for (const [scope, keymap] of Object.entries(SCOPED_KEYMAP) as [Scope, ScopeKeymap][]) {
    for (const commandName of Object.keys(keymap)) {
      const scopes = map.get(commandName) ?? [];
      scopes.push(scope);
      map.set(commandName, scopes);
    }
  }
  return map;
})();

/**
 * Whether a reader may give this command a shortcut of their choosing.
 * @param commandName - A key of a scope's keymap
 * @returns True for every bound command but the fixed few
 */
export function isRebindable(commandName: string): boolean {
  return SCOPES_BY_COMMAND.has(commandName) && !FIXED_COMMANDS.has(commandName);
}

/**
 * The overrides a settings object carries, reduced to the ones that can
 * apply.
 *
 * Settings come back from localStorage, where anything may have been
 * written: a command that no longer exists, a value that is not a string,
 * a shortcut that names no key. None of those should reach hotkeys-js,
 * which would bind them silently, so they are dropped here and the reader's
 * other overrides survive.
 * @param raw - `settings.general.keybindings`, or anything that stood in for it
 * @returns The overrides worth applying
 */
export function resolveOverrides(raw: unknown): KeybindingOverrides {
  const overrides: Record<string, string> = {};
  if (raw === null || typeof raw !== 'object') {
    return overrides;
  }
  for (const [commandName, combo] of Object.entries(raw as Record<string, unknown>)) {
    if (!isRebindable(commandName) || typeof combo !== 'string') {
      continue;
    }
    const normalized = normalizeCombo(combo);
    if (normalized.length === 0) {
      continue;
    }
    overrides[commandName] = normalized;
  }
  return overrides;
}

/**
 * The keymap of a scope with a reader's overrides applied.
 *
 * An overridden entry keeps its description and its visibility and takes the
 * reader's shortcut, spelled for the help menu by {@link formatCombo} rather
 * than by the hand-written `helpKey` of the default, which named a key the
 * reader no longer presses.
 * @param scope - The scope to get the keymap for.
 * @param overrides - Shortcuts the reader has changed, by command.
 * @returns The keymap for the scope.
 */
export function getKeymapForScope(scope: Scope, overrides: KeybindingOverrides = {}): ScopeKeymap {
  const keymap = SCOPED_KEYMAP[scope] as ScopeKeymap;
  const applied: Record<string, KeybindingEntry> = {};
  for (const [commandName, entry] of Object.entries(keymap)) {
    const combo = overrides[commandName];
    applied[commandName] = combo === undefined || !isRebindable(commandName)
      ? entry
      : { ...entry, hotkey: combo, helpKey: formatCombo(combo) };
  }
  return applied;
}

/** What a rebinding would collide with: the other command and where. */
export interface BindingConflict {
  scope: Scope;
  commandName: string;
  description: MessageKey;
}

/**
 * The command a shortcut already runs in a scope the given command is bound
 * in, or null when the shortcut is free everywhere it would apply.
 *
 * Checked against the effective keymap -- the defaults with the reader's
 * other overrides applied -- and against every scope the command lives in,
 * because a command moved in trace and braille mode at once has to be free
 * in both. Hidden bindings count: Escape is bound and unlisted in most
 * scopes, and a shortcut that would shadow it is still taken.
 * @param commandName - The command being rebound
 * @param combo - The shortcut it would take
 * @param overrides - The reader's other overrides
 * @returns The conflict, or null
 */
export function findBindingConflict(
  commandName: string,
  combo: string,
  overrides: KeybindingOverrides,
): BindingConflict | null {
  const wanted = normalizeCombo(combo);
  for (const scope of SCOPES_BY_COMMAND.get(commandName) ?? []) {
    const keymap = getKeymapForScope(scope, overrides);
    for (const [other, entry] of Object.entries(keymap)) {
      if (other === commandName) {
        continue;
      }
      if (combosOf(entry.hotkey).includes(wanted)) {
        return { scope, commandName: other, description: entry.description };
      }
    }
  }
  return null;
}

/**
 * Service for registering and managing keyboard bindings across application scopes.
 *
 * Observes the settings so a shortcut the reader changes in the help menu
 * takes effect at once: the bindings are torn down and put back with the new
 * overrides, in the scope the reader is in, without the page reloading.
 */
export class KeybindingService implements Observer<Settings> {
  private readonly commandFactory: CommandFactory;
  private readonly invalidKeyCommand: InvalidKeyCommand;

  /** The overrides the current bindings were made with, for change detection. */
  private overrides: KeybindingOverrides = {};

  /** The scope in force, so a rebind can put it back after unbinding. */
  private scope: Scope | null = null;

  /**
   * The keydown event a binding last claimed.
   *
   * Read only by {@link warnOnUnassignedKeys}, which compares by identity to
   * tell an unassigned press from one a shortcut has just handled.
   */
  private lastBoundEvent: KeyboardEvent | null = null;

  /**
   * Creates a new KeybindingService instance with command factory.
   * @param commandContext - The context for creating and executing commands
   */
  public constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
    this.invalidKeyCommand = new InvalidKeyCommand(
      commandContext.notificationService,
      commandContext.audioService,
    );
  }

  /**
   * Registers all keyboard bindings and sets the initial scope.
   * @param initialScope - The initial application scope to activate
   * @param overrides - Shortcuts the reader has changed, by command
   */
  public register(initialScope: Scope, overrides: KeybindingOverrides = {}): void {
    this.overrides = overrides;
    hotkeys.filter = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName.toLowerCase() === Constant.INPUT) {
        // Allow keybindings for MAIDR review input.
        return target.id.startsWith(Constant.REVIEW_INPUT);
      } else if (target.tagName.toLowerCase() === Constant.TEXT_AREA) {
        // Allow keybindings only for MAIDR braille text area.
        return target.id.startsWith(Constant.BRAILLE_TEXT_AREA);
      } else {
        // Allow keybindings for all other non-editable elements.
        return true;
      }
    };

    this.bindAll();
    this.setScope(initialScope);
  }

  /**
   * Binds every scope's keymap, with the current overrides applied.
   */
  private bindAll(): void {
    for (const scope of Object.keys(SCOPED_KEYMAP) as Scope[]) {
      const keymap = getKeymapForScope(scope, this.overrides);
      for (const [commandName, entry] of Object.entries(keymap) as [
        Keys,
        KeybindingEntry,
      ][]) {
        const hotkey = entry.hotkey;

        // https://github.com/jaywcjlove/hotkeys-js/issues/172
        // Need to remove once the issue is resolved.
        if (commandName === 'STOP_AUTOPLAY') {
          hotkeys('*', scope, (event: KeyboardEvent): void => {
            if (hotkeys.command || hotkeys.ctrl) {
              this.lastBoundEvent = event;
              const command = this.commandFactory.create(commandName);
              command.execute(event);
            }
          });
        }

        hotkeys(hotkey, { scope }, (event: KeyboardEvent): void => {
          this.lastBoundEvent = event;
          if (commandName !== 'ALLOW_DEFAULT') {
            event.preventDefault();
            const command = this.commandFactory.create(commandName);
            command.execute(event);
          }
        });
      }

      this.warnOnUnassignedKeys(scope, keymap);
    }
  }

  /**
   * Re-binds everything when the reader's shortcuts change.
   *
   * Nothing moves for a settings change that leaves the shortcuts alone --
   * volume, language, a braille display -- because unbinding and rebinding
   * is not free and the reader may be mid-chord.
   * @param settings - The settings just saved
   */
  public update(settings: Settings): void {
    const overrides = resolveOverrides(settings.general.keybindings);
    if (sameOverrides(overrides, this.overrides)) {
      return;
    }
    this.overrides = overrides;
    if (this.scope === null) {
      return;
    }
    hotkeys.unbind();
    this.bindAll();
    this.setScope(this.scope);
  }

  /**
   * Speaks up when a key this scope has no shortcut for is pressed.
   *
   * The old answer was silence, which a reader cannot tell apart from a chart
   * that has stopped responding, and which never mentions that a key list
   * exists at all. Only scopes that bind {@link HELP_CHORD} take the warning:
   * the advice it gives has to be advice the reader can act on, and inside a
   * modal -- settings, chat, the command palette -- help is not reachable and
   * the keystroke is likelier to be typing than a missed shortcut.
   *
   * hotkeys-js dispatches every `*` handler for an event before any of the
   * handlers bound to that specific key, so at this point no shortcut has had
   * the chance to claim the press yet. Deferring the check to a microtask lets
   * the rest of the dispatch run first, and makes hotkeys-js itself the judge
   * of what counts as bound -- there is no second copy of its key parsing here
   * to fall out of step with the keymaps.
   *
   * @param scope - The scope whose unassigned keys should warn.
   * @param keymap - That scope's keymap, checked for the help chord.
   */
  private warnOnUnassignedKeys(scope: Scope, keymap: ScopeKeymap): void {
    if (keymap.TOGGLE_HELP?.hotkey !== HELP_CHORD) {
      return;
    }

    hotkeys('*', scope, (event: KeyboardEvent): void => {
      queueMicrotask(() => {
        const claimed = this.lastBoundEvent === event;
        this.lastBoundEvent = null;
        if (!claimed) {
          this.invalidKeyCommand.execute(event);
        }
      });
    });
  }

  /**
   * Activates a keyboard scope, so only that scope's bindings fire.
   *
   * `Context` decides which scope the reader is in and fires
   * `onScopeChange`; this applies it. Keeping the call here leaves one writer
   * to the hotkeys-js scope — the same object that binds the keys and unbinds
   * them in {@link unregister}.
   *
   * @param scope - The scope to activate
   */
  public setScope(scope: Scope): void {
    this.scope = scope;
    hotkeys.setScope(scope);
  }

  /**
   * Unregisters all keyboard bindings.
   */
  public unregister(): void {
    this.scope = null;
    hotkeys.unbind();
  }
}

/**
 * Whether two sets of overrides bind the same shortcuts.
 * @param a - One set
 * @param b - The other
 * @returns True when every command has the same shortcut in both
 */
function sameOverrides(a: KeybindingOverrides, b: KeybindingOverrides): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

/**
 * Service for managing mouse interactions with plot elements based on hover settings.
 */
export class Mousebindingservice implements Observer<Settings>, Disposable {
  private pointermoveListener!: (event: PointerEvent) => void;
  private clickListener!: (event: MouseEvent) => void;
  private pointerLeaveListener!: () => void;
  private readonly pointerGuidanceCommand: PointerGuidanceCommand;

  private readonly commandContext: CommandContext;
  private hoverMode: string = 'none';
  private readonly plot: HTMLElement;
  private readonly settingsService: SettingsService;

  /**
   * Creates a new Mousebindingservice instance and registers as a settings observer.
   * @param commandContext - The command context for executing navigation commands
   * @param settingsService - The settings service to observe for hover mode changes
   * @param displayService - The display service providing the plot element
   */
  public constructor(
    commandContext: CommandContext,
    settingsService: SettingsService,
    displayService: DisplayService,
  ) {
    this.commandContext = commandContext;
    this.settingsService = settingsService;
    const initialSettings = settingsService.loadSettings();
    this.hoverMode = initialSettings.general.hoverMode;
    this.plot = displayService.plot;
    this.pointerGuidanceCommand = new PointerGuidanceCommand(
      this.commandContext.context,
      this.commandContext.audioService,
    );

    // Register as observer to listen for settings changes
    this.settingsService.addObserver(this);
  }

  /**
   * Registers mouse event listeners based on the current hover mode setting.
   */
  public registerEvents(): void {
    // Lazily create listeners. pointermove gets full guidance behaviour;
    // click only navigates so a click between points does not trigger a
    // directional guidance beep (data sonification still fires via the
    // Observer chain on a successful move).
    if (!this.pointermoveListener) {
      this.pointermoveListener = (event: PointerEvent) => {
        this.pointerGuidanceCommand.execute(event);
      };
    }

    if (!this.clickListener) {
      this.clickListener = (event: MouseEvent) => {
        this.pointerGuidanceCommand.executeNavigateOnly(event);
      };
    }

    if (!this.pointerLeaveListener) {
      this.pointerLeaveListener = () => {
        this.pointerGuidanceCommand.reset();
      };
    }

    // Remove any existing listeners first to avoid duplicates
    this.removeEventListeners();

    // Add appropriate listeners based on hover mode.
    // `pointerleave` is only attached for `pointermove` mode: it exists to
    // clear throttle state that `pointermove` builds up during continuous
    // hover. `click` mode produces a single discrete event with no throttle
    // state to clear, so it intentionally skips the leave handler — the
    // removal guard in `removeEventListeners` still no-ops safely.
    if (this.hoverMode === 'pointermove') {
      this.plot.addEventListener('pointermove', this.pointermoveListener);
      this.plot.addEventListener('pointerleave', this.pointerLeaveListener);
    } else if (this.hoverMode === 'click') {
      this.plot.addEventListener('click', this.clickListener);
    } else {
      this.pointerGuidanceCommand.reset();
    }
  }

  /**
   * Removes all mouse event listeners from the plot element.
   */
  private removeEventListeners(): void {
    if (this.pointermoveListener) {
      this.plot.removeEventListener('pointermove', this.pointermoveListener);
    }
    if (this.clickListener) {
      this.plot.removeEventListener('click', this.clickListener);
    }
    if (this.pointerLeaveListener) {
      this.plot.removeEventListener('pointerleave', this.pointerLeaveListener);
    }
    this.pointerGuidanceCommand.reset();
  }

  /**
   * Unregisters all mouse event listeners.
   */
  public unregister(): void {
    this.removeEventListeners();
  }

  /**
   * Updates mouse bindings when settings change, particularly hover mode.
   * @param settings - The updated settings object
   */
  public update(settings: Settings): void {
    const newHoverMode = settings.general.hoverMode;

    // Only update if the hover mode has changed
    if (this.hoverMode !== newHoverMode) {
      this.hoverMode = newHoverMode;

      // Re-register events with the new hover mode
      this.registerEvents();
    }
  }

  /**
   * Cleans up event listeners and removes observer registration.
   */
  public dispose(): void {
    this.unregister();
    this.settingsService.removeObserver(this);
  }
}
