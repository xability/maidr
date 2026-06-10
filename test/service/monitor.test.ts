import type { NotificationService } from '@service/notification';
import type { Observer } from '@type/observable';
import type { PlotState, TraceState } from '@type/state';
import { describe, expect, jest, test } from '@jest/globals';
import { MonitorService } from '@service/monitor';

/**
 * Creates a MonitorService wired to mock observers for testing.
 * @param isLive - Whether the chart is configured for live updates
 * @returns The service under test together with its mocked collaborators
 */
function createMonitorService(isLive: boolean): {
  service: MonitorService;
  audio: Observer<PlotState>;
  text: Observer<PlotState>;
  notification: NotificationService;
} {
  const audio = { update: jest.fn() };
  const text = { update: jest.fn() };
  const notification = { notify: jest.fn() } as unknown as NotificationService;
  const service = new MonitorService(isLive, audio, text, notification);
  return { service, audio, text, notification };
}

/**
 * Creates a minimal non-empty trace state for monitor announcements.
 * @returns A trace state stub
 */
function createTraceState(): TraceState {
  return { empty: false, type: 'trace' } as TraceState;
}

describe('monitorService', () => {
  test('starts disabled', () => {
    const { service } = createMonitorService(true);
    expect(service.isEnabled).toBe(false);
  });

  test('toggle enables monitoring on a live chart and notifies', () => {
    const { service, notification } = createMonitorService(true);

    service.toggle();

    expect(service.isEnabled).toBe(true);
    expect(notification.notify).toHaveBeenCalledWith('Monitoring on');
  });

  test('toggling twice disables monitoring and notifies', () => {
    const { service, notification } = createMonitorService(true);

    service.toggle();
    service.toggle();

    expect(service.isEnabled).toBe(false);
    expect(notification.notify).toHaveBeenLastCalledWith('Monitoring off');
  });

  test('toggle on a non-live chart stays disabled and explains why', () => {
    const { service, notification } = createMonitorService(false);

    service.toggle();

    expect(service.isEnabled).toBe(false);
    expect(notification.notify).toHaveBeenCalledWith(
      'Monitoring is available only for live charts',
    );
  });

  test('handleNewPoint does nothing while disabled', () => {
    const { service, audio, text } = createMonitorService(true);

    service.handleNewPoint(createTraceState());

    expect(audio.update).not.toHaveBeenCalled();
    expect(text.update).not.toHaveBeenCalled();
  });

  test('handleNewPoint sonifies and announces the new point when enabled', () => {
    const { service, audio, text } = createMonitorService(true);
    const state = createTraceState();

    service.toggle();
    service.handleNewPoint(state);

    expect(audio.update).toHaveBeenCalledWith(state);
    expect(text.update).toHaveBeenCalledWith(state);
  });

  test('handleNewPoint ignores empty states', () => {
    const { service, audio, text } = createMonitorService(true);

    service.toggle();
    service.handleNewPoint({ empty: true, type: 'trace' } as TraceState);

    expect(audio.update).not.toHaveBeenCalled();
    expect(text.update).not.toHaveBeenCalled();
  });

  test('dispose disables monitoring', () => {
    const { service } = createMonitorService(true);

    service.toggle();
    service.dispose();

    expect(service.isEnabled).toBe(false);
  });
});
