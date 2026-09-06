import type { Subplot, Trace } from '@model/plot';
import type { Disposable } from '@type/disposable';
import type { MovableDirection } from '@type/movable';
import type { LayerSwitchTraceState } from '@type/state';

/**
 * NavigationService switches the active layer of a subplot, preserving the
 * reader's position across the switch and announcing the result once.
 *
 * The coordinate helpers it used to carry are pure functions over data a
 * trace already holds, so they live in `@util/navigation` where the model can
 * reach them without importing a service.
 */
export class NavigationService implements Disposable {
  /**
   * Handle layer switching within a subplot. Encapsulates business logic for
   * preserving positions, invoking trace-specific switch handling, and
   * notifying observers about layer switches.
   *
   * @returns The newly active trace (may be the same as the previous one) or null if unavailable.
   */
  public stepTraceInSubplot(subplot: Subplot, direction: MovableDirection): Trace | null {
    const currentTrace = subplot.activeTrace;
    if (!currentTrace) {
      return null;
    }

    // At the edge of the layers there is one boundary to report: the trace's
    // tone and the subplot's "no additional layer", once each. Checked before
    // moving, because `subplot.moveOnce` would notify the subplot's boundary
    // itself and the pair below would then repeat it.
    if (!subplot.isMovable(direction)) {
      currentTrace.notifyOutOfBounds();
      subplot.notifyOutOfBounds();
      return currentTrace;
    }

    // Switch to next/previous trace. Stepped silently: a subplot notification
    // here would describe the new trace at the column it was left on, before
    // X-preservation has positioned it. The switch is announced from the
    // positioned trace below.
    const currentXValue = currentTrace.getCurrentXValue();
    subplot.stepLayer(direction);
    const newTrace = subplot.activeTrace;

    if (!newTrace) {
      return null;
    }

    // Attempt Y-preservation: if both traces support Y values, preserve both X and Y
    let positioned = false;
    if (
      typeof currentTrace.getCurrentYValue === 'function'
      && typeof newTrace.moveToXAndYValue === 'function'
    ) {
      const currentYValue = currentTrace.getCurrentYValue();
      if (currentYValue !== null && currentXValue !== null) {
        positioned = newTrace.moveToXAndYValue(currentXValue, currentYValue);
      }
    }

    // Default: preserve X value when changing layers
    if (!positioned) {
      newTrace.moveToXValue(currentXValue);
    }

    // Notify after positioning is complete
    this.notifyLayerSwitch(subplot, newTrace);
    return newTrace;
  }

  /**
   * Cleanup method to dispose of service resources.
   */
  public dispose(): void {
    // Currently no resources to clean up
    // This method is implemented for future extensibility
  }

  private notifyLayerSwitch(subplot: Subplot, trace: Trace): void {
    if (!trace.state.empty) {
      const index = subplot.getRow() + 1;
      const size = subplot.getSize();
      const state: LayerSwitchTraceState = {
        ...trace.state,
        isLayerSwitch: true,
        index,
        size,
      };
      trace.notifyObserversWithState(state);
    } else {
      trace.notifyStateUpdate();
    }
  }
}
