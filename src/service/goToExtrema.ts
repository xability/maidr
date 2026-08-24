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

    const activeTrace = this.context.active;
    if (activeTrace && this.isExtremaNavigable(activeTrace)) {
      // Ensure we're in GO_TO_EXTREMA scope
      if (this.context.scope !== Scope.GO_TO_EXTREMA) {
        this.display.toggleFocus(Scope.GO_TO_EXTREMA);
      }
    }
  }

  public isExtremaNavigable(trace: unknown): trace is AbstractTrace {
    return trace instanceof AbstractTrace && trace.supportsExtremaNavigation();
  }

  /**
   * Leaves the GO_TO_EXTREMA scope, returning to whichever scope opened the
   * dialog. `toggleFocus` pops GO_TO_EXTREMA off the focus stack, so the
   * restored scope is BRAILLE when the dialog was opened from braille mode and
   * TRACE when it was opened from the chart.
   *
   * The guard tests for GO_TO_EXTREMA rather than "not TRACE": the dismissal
   * paths call this both directly and after `hide()` has already restored the
   * scope, and a "not TRACE" guard would read the restored BRAILLE scope as
   * still-open and push GO_TO_EXTREMA back onto the stack.
   */
  public returnToTraceScope(): void {
    if (this.context.scope === Scope.GO_TO_EXTREMA) {
      this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
  }
}
