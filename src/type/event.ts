import type { Keymap } from '@service/keybinding';
import type { Disposable } from './disposable';

export enum DomEventType {
  CLICK = 'click',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS_IN = 'focusin',
  FOCUS_OUT = 'focusout',
  SELECTION_CHANGE = 'selectionchange',
}

export type Status =
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED';

export enum Scope {
  BRAILLE = 'BRAILLE',
  CHAT = 'CHAT',
  HELP = 'HELP',
  FIGURE_LABEL = 'FIGURE_LABEL',
  SUBPLOT = 'SUBPLOT',
  TRACE = 'TRACE',
  TRACE_LABEL = 'TRACE_LABEL',
  REVIEW = 'REVIEW',
  SETTINGS = 'SETTINGS',
}

export type Focus = Exclude<Scope, Scope.FIGURE_LABEL | Scope.TRACE_LABEL>;

export type Keys = keyof Keymap[Scope];

export type Event<T> = (listener: (e: T) => any) => Disposable;

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
