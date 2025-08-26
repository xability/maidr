import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { TraceState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';

export class GoToSpecificValueService {
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

    if (activeTrace && this.isSpecificValueNavigable(activeTrace)) {
      this.display.toggleFocus(Scope.GO_TO_SPECIFIC_VALUE);
    }
  }

  private isSpecificValueNavigable(trace: any): trace is AbstractTrace<number> {
    return trace instanceof AbstractTrace && 'getAvailableXValues' in trace && 'moveToXValue' in trace;
  }

  public returnToTraceScope(): void {
    this.display.setFocus(Scope.TRACE);
  }
}
