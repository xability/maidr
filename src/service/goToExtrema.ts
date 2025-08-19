import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { TraceState } from '@type/state';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

export interface ExtremaTarget {
  label: string;
  value: number;
  pointIndex: number;
  segment: string;
  type: 'max' | 'min';
}

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

    if (state.traceType !== TraceType.CANDLESTICK) {
      return;
    }

    // Get the active trace (should be a candlestick)
    const activeTrace = this.context.active;

    if (activeTrace && 'getExtremaTargets' in activeTrace) {
      // Change scope to GO_TO_EXTREMA - this will activate the GO_TO_EXTREMA_KEYMAP
      // and deactivate the TRACE_KEYMAP, so arrow keys will work in the modal
      this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
  }

  /**
   * Return focus to the previous scope (usually TRACE)
   * Called when the modal is closed to restore plot navigation
   */
  public returnToTraceScope(): void {
    this.display.toggleFocus(Scope.GO_TO_EXTREMA);
  }
}
