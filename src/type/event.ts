import type { Keymap } from '@service/keybinding';
import type { Disposable } from './disposable';

/**
 * Configuration for a single keyboard binding entry.
 */
export interface KeybindingEntry {
  /** The hotkey string (e.g., 's', 'ctrl+up', 'shift+/') */
  hotkey: string;
  /** Human-readable description for the help menu */
  description: string;
  /** Override the key display in help menu (e.g., 'cmd + up' instead of 'cmd+up') */
  helpKey?: string;
  /** Whether to show this entry in the help menu (default: true) */
  showInHelp?: boolean;
}

/**
 * Standard DOM event types used throughout the application.
 */
export enum DomEventType {
  CLICK = 'click',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS_IN = 'focusin',
  FOCUS_OUT = 'focusout',
  MOUSE_ENTER = 'mouseenter',
  MOUSE_LEAVE = 'mouseleave',
  MOUSE_MOVE = 'mousemove',
  SELECTION_CHANGE = 'selectionchange',
  VISIBILITY_CHANGE = 'visibilitychange',
}

/**
 * Status of asynchronous operations like API requests.
 */
export type Status
  = | 'PENDING'
    | 'SUCCESS'
    | 'FAILED';

/**
 * Application scopes that define different keyboard navigation contexts and UI modes.
 */
export enum Scope {
  BRAILLE = 'BRAILLE',
  /** Navigating the virtual candlestick-vs-reference-line delta layer. */
  CANDLESTICK_DELTA = 'CANDLESTICK_DELTA',
  /** The reference-line picker (Ctrl+Shift+L) for the candlestick delta layer. */
  CANDLESTICK_DELTA_SETTINGS = 'CANDLESTICK_DELTA_SETTINGS',
  CHAT = 'CHAT',
  COMMAND_PALETTE = 'COMMAND_PALETTE',
  DESCRIPTION = 'DESCRIPTION',
  GO_TO_EXTREMA = 'GO_TO_EXTREMA',
  GRID_CELL = 'GRID_CELL',
  HELP = 'HELP',
  FIGURE_LABEL = 'FIGURE_LABEL',
  SUBPLOT = 'SUBPLOT',
  TRACE = 'TRACE',
  TRACE_LABEL = 'TRACE_LABEL',
  REVIEW = 'REVIEW',
  SETTINGS = 'SETTINGS',
}

/**
 * Focusable scopes excluding label-only scopes that cannot receive keyboard focus.
 */
export type Focus = Exclude<Scope, Scope.FIGURE_LABEL | Scope.TRACE_LABEL>;

/**
 * Scopes the user opens on top of the chart and dismisses with Escape, as
 * opposed to the scopes they navigate the data in. Entering one is a mode
 * toggle: the plot instruction is not re-announced on the way back out.
 */
export const MODAL_SCOPES: ReadonlySet<Focus> = new Set<Focus>([
  Scope.BRAILLE,
  Scope.CANDLESTICK_DELTA_SETTINGS,
  Scope.CHAT,
  Scope.COMMAND_PALETTE,
  Scope.DESCRIPTION,
  Scope.GO_TO_EXTREMA,
  Scope.HELP,
  Scope.REVIEW,
  Scope.SETTINGS,
]);

/**
 * The modal scopes that render as a dialog overlaying the chart, derived from
 * {@link MODAL_SCOPES} so a scope cannot be added to one list and forgotten in
 * the other.
 *
 * `BRAILLE` and `REVIEW` are the two exclusions: they render as an inline text
 * field beside the chart rather than as an overlay, so anything that describes
 * a dialog — the open/close audio cue, for one — would misdescribe them.
 */
export const DIALOG_SCOPES: ReadonlySet<Focus> = new Set<Focus>(
  Array.from(MODAL_SCOPES).filter(
    scope => scope !== Scope.BRAILLE && scope !== Scope.REVIEW,
  ),
);

/**
 * Type representing valid keyboard shortcut keys for a given scope.
 */
export type Keys = keyof Keymap[Scope];

/**
 * Event subscription function that returns a disposable for cleanup.
 */
export type Event<T> = (listener: (e: T) => any) => Disposable;

/**
 * Generic event emitter that manages listeners and fires events to subscribers.
 */
export class Emitter<T> {
  private readonly listeners: Set<(event: T) => void>;

  public constructor() {
    this.listeners = new Set();
  }

  public dispose(): void {
    this.listeners.clear();
  }

  public event: Event<T> = (listener: (e: T) => any): Disposable => {
    this.listeners.add(listener);
    return {
      dispose: () => this.listeners.delete(listener),
    };
  };

  public fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
