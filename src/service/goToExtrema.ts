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
      this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
  }

  public isExtremaNavigable(trace: unknown): trace is AbstractTrace<number> {
    return trace instanceof AbstractTrace && trace.supportsExtremaNavigation();
  }

  public returnToTraceScope(): void {
    this.display.toggleFocus(Scope.GO_TO_EXTREMA);
  }
}
