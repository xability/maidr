import type { Keymap } from '@service/keybinding';
import type { Disposable } from './disposable';

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
  CHAT = 'CHAT',
  COMMAND_PALETTE = 'COMMAND_PALETTE',
  GO_TO_EXTREMA = 'GO_TO_EXTREMA',
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
