import type { NotificationService } from '@service/notification';
import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState, TraceState } from '@type/state';

/**
 * Monitor mode for live charts.
 *
 * When enabled (toggled with the 'M' key), newly appended data points are
 * automatically sonified and announced to screen readers without moving the
 * user's current position — mirroring chart2music's monitoring behavior.
 *
 * Monitoring is only available on charts configured with `live: true`.
 */
export class MonitorService implements Disposable {
  private enabled: boolean;
  private isLive: boolean;

  /**
   * Creates a new MonitorService.
   *
   * @param isLive - Whether the chart is configured for live updates
   * @param audio - Observer that sonifies a trace state (AudioService)
   * @param text - Observer that announces a trace state (TextService)
   * @param notification - Service for user feedback on toggling
   */
  public constructor(
    isLive: boolean,
    private readonly audio: Observer<PlotState>,
    private readonly text: Observer<PlotState>,
    private readonly notification: NotificationService,
  ) {
    this.isLive = isLive;
    this.enabled = false;
  }

  /**
   * Updates the live flag when a data update changes the chart's
   * configuration. Turning live mode off also stops monitoring.
   *
   * @param isLive - Whether the chart is now configured for live updates
   */
  public setLive(isLive: boolean): void {
    this.isLive = isLive;
    if (!isLive) {
      this.enabled = false;
    }
  }

  /**
   * Whether monitor mode is currently active.
   */
  public get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Toggles monitor mode and announces the new state.
   * On non-live charts, monitoring stays off and the user is told why.
   */
  public toggle(): void {
    if (!this.isLive) {
      this.notification.notify('Monitoring is available only for live charts');
      return;
    }
    this.enabled = !this.enabled;
    this.notification.notify(this.enabled ? 'Monitoring on' : 'Monitoring off');
  }

  /**
   * Sonifies and announces a newly appended data point when monitoring is on.
   *
   * @param state - The trace state computed at the new point's position
   */
  public handleNewPoint(state: TraceState): void {
    if (!this.enabled || state.empty) {
      return;
    }
    this.audio.update(state);
    this.text.update(state);
  }

  /**
   * Disables monitoring and releases resources.
   */
  public dispose(): void {
    this.enabled = false;
  }
}
