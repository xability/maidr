import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { TraceState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';

/**
 * Service for managing navigation to extreme data points in traces.
 */
export class GoToExtremaService {
  private readonly context: Context;
  private readonly display: DisplayService;

  /**
   * Creates a new GoToExtremaService instance.
   * @param context - The application context containing trace and scope information
   * @param display - The display service for managing UI focus
   */
  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  /**
   * Toggles the extrema navigation mode if the current trace supports it.
   * @param state - The current trace state
   */
  public toggle(state: TraceState): void {
    if (state.empty) {
      return;
    }

    const activeTrace = this.context.active;
    if (activeTrace && this.isExtremaNavigable(activeTrace)) {
      // Ensure we're in GO_TO_EXTREMA scope
      if (this.context.scope !== Scope.GO_TO_EXTREMA) {
        this.display.toggleFocus(Scope.GO_TO_EXTREMA);
      }
    }
  }

  /**
   * Checks if a trace supports extrema navigation functionality.
   * @param trace - The trace object to check
   * @returns True if the trace is navigable and supports extrema navigation
   */
  public isExtremaNavigable(trace: unknown): trace is AbstractTrace<number> {
    return trace instanceof AbstractTrace && trace.supportsExtremaNavigation();
  }

  /**
   * Returns the navigation scope back to the trace scope from extrema mode.
   */
  public returnToTraceScope(): void {
    // Ensure we return to TRACE scope
    if (this.context.scope !== Scope.TRACE) {
      this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
  }
}
