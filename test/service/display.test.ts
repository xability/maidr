import type { Context } from '@model/context';
import type { TextService } from '@service/text';
import type { Focus } from '@type/event';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DisplayService } from '@service/display';
import { Scope } from '@type/event';

/**
 * Creates a minimal mock HTMLElement with the methods DisplayService uses.
 */
function createMockPlot(): HTMLElement {
  return {
    focus: jest.fn(),
    setAttribute: jest.fn(),
    removeAttribute: jest.fn(),
    tabIndex: 0,
  } as unknown as HTMLElement;
}

/**
 * Creates a minimal mock Context.
 */
function createMockContext(scope: string = 'SUBPLOT'): Context {
  return {
    scope,
    state: { type: 'subplot', empty: true },
    getInstruction: jest.fn(() => 'test instruction'),
    toggleScope: jest.fn(),
    active: { notifyStateUpdate: jest.fn() },
  } as unknown as Context;
}

/**
 * Creates a minimal mock TextService.
 */
function createMockTextService(): TextService {
  return {
    onChange: jest.fn(() => ({ dispose: jest.fn() })),
    format: jest.fn(() => ''),
  } as unknown as TextService;
}

describe('DisplayService.dismissModalScope', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('moves focus to the plot element', () => {
    const plot = createMockPlot();
    const context = createMockContext();
    const textService = createMockTextService();
    const service = new DisplayService(context, plot, textService);

    service.dismissModalScope(Scope.SUBPLOT);

    expect(plot.focus).toHaveBeenCalled();
  });

  test('resets the focus stack to the target scope', () => {
    const plot = createMockPlot();
    const context = createMockContext();
    const textService = createMockTextService();
    const service = new DisplayService(context, plot, textService);

    // Verify by listening for change events
    const events: Focus[] = [];
    service.onChange((e) => {
      events.push(e.value);
    });

    // Dismiss with SUBPLOT as target
    service.dismissModalScope(Scope.SUBPLOT);

    // Now fire a deferred notification — should emit SUBPLOT
    service.notifyFocusChange(Scope.SUBPLOT);
    jest.runAllTimers();

    expect(events).toEqual([Scope.SUBPLOT]);
  });

  test('does not fire a display change event synchronously', () => {
    const plot = createMockPlot();
    const context = createMockContext();
    const textService = createMockTextService();
    const service = new DisplayService(context, plot, textService);

    const listener = jest.fn();
    service.onChange(listener);

    service.dismissModalScope(Scope.SUBPLOT);

    // dismissModalScope itself should not fire any event
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('DisplayService.notifyFocusChange', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fires the change event after a deferred tick', () => {
    const plot = createMockPlot();
    const context = createMockContext();
    const textService = createMockTextService();
    const service = new DisplayService(context, plot, textService);

    const events: Focus[] = [];
    service.onChange((e) => {
      events.push(e.value);
    });

    service.notifyFocusChange(Scope.SUBPLOT);

    // Event should not have fired yet (deferred)
    expect(events).toEqual([]);

    jest.runAllTimers();

    expect(events).toEqual([Scope.SUBPLOT]);
  });

  test('cancels a pending notification when called again', () => {
    const plot = createMockPlot();
    const context = createMockContext();
    const textService = createMockTextService();
    const service = new DisplayService(context, plot, textService);

    const events: Focus[] = [];
    service.onChange((e) => {
      events.push(e.value);
    });

    // Fire twice rapidly — first should be cancelled
    service.notifyFocusChange(Scope.TRACE);
    service.notifyFocusChange(Scope.SUBPLOT);

    jest.runAllTimers();

    // Only the second call's scope should have fired
    expect(events).toEqual([Scope.SUBPLOT]);
  });

  test('cleans up pending timer on dispose', () => {
    const plot = createMockPlot();
    const context = createMockContext();
    const textService = createMockTextService();
    const service = new DisplayService(context, plot, textService);

    const events: Focus[] = [];
    service.onChange((e) => {
      events.push(e.value);
    });

    service.notifyFocusChange(Scope.SUBPLOT);
    service.dispose();

    jest.runAllTimers();

    // Event should not fire after dispose
    expect(events).toEqual([]);
  });
});
