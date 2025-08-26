import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { TraceState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';

export class GoToExtremaService {
  private readonly context: Context;
  private readonly display: DisplayService;

  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      return;
    }

    // Get the active trace
    const activeTrace = this.context.active;

    // Check if the trace supports extrema navigation using the abstract class method
    if (activeTrace && this.isExtremaNavigable(activeTrace)) {
      // Change scope to GO_TO_EXTREMA - this will activate the GO_TO_EXTREMA_KEYMAP
      // and deactivate the TRACE_KEYMAP, so arrow keys will work in the modal
      this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
  }

  /**
   * Check if a trace supports extrema navigation
   * @param trace The trace to check
   * @returns True if the trace supports extrema navigation
   */
  private isExtremaNavigable(trace: any): trace is AbstractTrace<number> {
    return trace instanceof AbstractTrace && trace.supportsExtremaNavigation();
  }

  /**
   * Return focus to the previous scope (usually TRACE)
   * Called when the modal is closed to restore plot navigation
   */
  public returnToTraceScope(): void {
    this.display.setFocus(Scope.TRACE);
  }
}
