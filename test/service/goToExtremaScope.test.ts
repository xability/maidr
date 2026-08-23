/**
 * Scope handling for the go-to-extrema dialog.
 *
 * The `g` binding exists in both TRACE and BRAILLE scope, so the dialog has to
 * hand the scope back to whichever one opened it. These tests drive the real
 * DisplayService focus stack so the restored scope is the one a user would
 * actually land in.
 */
import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { TraceState } from '@type/state';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { AbstractTrace } from '@model/abstract';
import { DisplayService } from '@service/display';
import { GoToExtremaService } from '@service/goToExtrema';
import { Scope } from '@type/event';

/** Minimal plot element exposing only what DisplayService touches. */
function createMockPlot(): HTMLElement {
  return {
    focus: jest.fn(),
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    tabIndex: 0,
  } as unknown as HTMLElement;
}

function createMockTextService(): TextService {
  return {
    onChange: jest.fn(() => ({ dispose: jest.fn() })),
    format: jest.fn(() => ''),
  } as unknown as TextService;
}

/**
 * A trace the service accepts as extrema-navigable. `isExtremaNavigable` is an
 * `instanceof AbstractTrace` check, so the stub is built on that prototype
 * rather than as a plain object.
 */
function createNavigableTrace(): AbstractTrace {
  const trace = Object.create(AbstractTrace.prototype) as AbstractTrace;
  (trace as unknown as { supportsExtremaNavigation: () => boolean }).supportsExtremaNavigation = () => true;
  return trace;
}

/** Context stub that applies `toggleScope` to its own `scope`, as the real one does. */
function createMockContext(scope: Scope): Context {
  const context = {
    scope,
    state: { type: 'trace', empty: false },
    active: createNavigableTrace(),
    getInstruction: jest.fn(() => 'test instruction'),
    toggleScope: jest.fn((next: Scope) => {
      context.scope = next;
    }),
  };
  return context as unknown as Context;
}

const TRACE_STATE = { type: 'trace', empty: false } as unknown as TraceState;

describe('goToExtremaService scope restore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(): { context: Context; display: DisplayService; service: GoToExtremaService } {
    const context = createMockContext(Scope.TRACE);
    const display = new DisplayService(context, createMockPlot(), createMockTextService());
    const service = new GoToExtremaService(context, display);
    return { context, display, service };
  }

  test('returns to braille mode when the dialog is opened from braille', () => {
    const { context, display, service } = setup();

    // Enter braille mode the way ToggleBrailleCommand does.
    display.toggleFocus(Scope.BRAILLE);
    jest.runAllTimers();
    expect(context.scope).toBe(Scope.BRAILLE);

    service.toggle(TRACE_STATE);
    expect(context.scope).toBe(Scope.GO_TO_EXTREMA);

    service.returnToTraceScope();
    jest.runAllTimers();
    expect(context.scope).toBe(Scope.BRAILLE);
  });

  test('returns to the chart when the dialog is opened from trace scope', () => {
    const { context, service } = setup();

    service.toggle(TRACE_STATE);
    expect(context.scope).toBe(Scope.GO_TO_EXTREMA);

    service.returnToTraceScope();
    jest.runAllTimers();
    expect(context.scope).toBe(Scope.TRACE);
  });

  test('does not reopen the dialog scope when the scope was already restored', () => {
    const { context, display, service } = setup();

    display.toggleFocus(Scope.BRAILLE);
    jest.runAllTimers();

    service.toggle(TRACE_STATE);
    service.returnToTraceScope();
    jest.runAllTimers();

    // The navigation-failure path calls this a second time after hide() has
    // already restored the scope; it must stay put instead of pushing
    // GO_TO_EXTREMA back on with no dialog rendered.
    service.returnToTraceScope();
    jest.runAllTimers();
    expect(context.scope).toBe(Scope.BRAILLE);
  });
});
