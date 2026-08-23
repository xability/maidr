import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { ExtremaTarget } from '@type/extrema';
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

  public returnToTraceScope(): void {
    // Ensure we return to TRACE scope
    if (this.context.scope !== Scope.TRACE) {
      this.display.toggleFocus(Scope.GO_TO_EXTREMA);
    }
  }

  /**
   * Jumps straight to the most extreme min or max point of the active trace,
   * skipping the extrema dialog. The dialog lists every extremum the trace
   * offers, which is what `g` is for; the bracket keys are the one-press
   * shortcut to the single lowest or highest value of them.
   *
   * Navigation itself goes through the same `navigateToExtrema` the dialog
   * uses, so the move is announced, brailled and highlighted by the usual
   * observer chain.
   * @param type - Which extreme to jump to.
   * @returns True when a target was found and navigated to, false otherwise.
   */
  public goToExtremeValue(type: 'min' | 'max'): boolean {
    const state = this.context.state;
    if (state.type !== 'trace' || state.empty) {
      return false;
    }

    const activeTrace = this.context.active;
    if (!this.isExtremaNavigable(activeTrace)) {
      return false;
    }

    const target = GoToExtremaService.selectExtremeTarget(
      activeTrace.getExtremaTargets(),
      type,
    );
    if (!target) {
      return false;
    }

    try {
      activeTrace.navigateToExtrema(target);
    } catch {
      // A trace can advertise extrema support without implementing the jump
      // (the base `navigateToExtrema` throws). Report failure so the caller
      // announces it instead of leaving the press silent.
      return false;
    }
    return true;
  }

  /**
   * Picks the single lowest (or highest) target out of a trace's extrema list.
   * A trace can report several min/max targets — one per tied point, per
   * segment, or per group — so the values are compared rather than taking the
   * first match. Ties keep the earliest target, matching the dialog's order.
   * @param targets - The extrema targets reported by the trace.
   * @param type - Which extreme to select.
   * @returns The most extreme target of that type, or null when none exists.
   */
  private static selectExtremeTarget(
    targets: ExtremaTarget[],
    type: 'min' | 'max',
  ): ExtremaTarget | null {
    let best: ExtremaTarget | null = null;
    for (const target of targets) {
      if (target.type !== type || !Number.isFinite(target.value)) {
        continue;
      }
      if (
        best === null
        || (type === 'min' ? target.value < best.value : target.value > best.value)
      ) {
        best = target;
      }
    }
    return best;
  }
}
