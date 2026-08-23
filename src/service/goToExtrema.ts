import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { ExtremaTarget } from '@type/extrema';
import type { TraceState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';

/**
 * Where a bracket-key jump landed among the points sharing that extreme value.
 * `total` is 1 when the value is held by a single point.
 */
export interface ExtremeJump {
  /** 1-based position among the tied points. */
  position: number;
  /** How many points share the value. */
  total: number;
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
   * Jumps to a min or max point of the active trace, skipping the extrema
   * dialog. The dialog lists every extremum the trace offers, which is what
   * `g` is for; the bracket keys are the one-press shortcut to the lowest or
   * highest value among them.
   *
   * A value can be tied across several points. Rather than always landing on
   * the first, each press steps to the next tied point and wraps at the end,
   * so a repeated press walks them. Which one the cursor currently sits on is
   * read back from the trace instead of being remembered here: stored state
   * would go stale the moment the reader moved by any other means, or the data
   * changed under a live chart.
   *
   * Navigation itself goes through the same `navigateToExtrema` the dialog
   * uses, so the move is announced, brailled and highlighted by the usual
   * observer chain.
   * @param type - Which extreme to jump to.
   * @returns Where the cursor landed among the tied points, or null when there
   * was nowhere to go.
   */
  public goToExtremeValue(type: 'min' | 'max'): ExtremeJump | null {
    const state = this.context.state;
    if (state.type !== 'trace' || state.empty) {
      return null;
    }

    const activeTrace = this.context.active;
    if (!this.isExtremaNavigable(activeTrace)) {
      return null;
    }

    const tied = GoToExtremaService.tiedExtremeTargets(
      activeTrace.getExtremaTargets(),
      type,
    );
    if (tied.length === 0) {
      return null;
    }

    // Not being on any of them — the usual case for a first press — starts at
    // the first. Being on one advances past it, so the press always moves
    // while there is somewhere else to go.
    //
    // Before the reader has moved, the cursor is parked on the first point
    // without their having heard it, so it is not a position to advance from:
    // treating it as one would skip the first tie when the chart happens to
    // open on it.
    const at = activeTrace.isInitialEntry
      ? -1
      : tied.findIndex(target => GoToExtremaService.isCursorAt(activeTrace, target));
    const next = at === -1 ? 0 : (at + 1) % tied.length;

    try {
      activeTrace.navigateToExtrema(tied[next]);
    } catch {
      // A trace can advertise extrema support without implementing the jump
      // (the base `navigateToExtrema` throws). Report failure so the caller
      // announces it instead of leaving the press silent.
      return null;
    }
    return { position: next + 1, total: tied.length };
  }

  /**
   * Every target sharing the lowest (or highest) value a trace reports, in the
   * order the trace listed them.
   *
   * A trace can report several min/max targets — one per tied point, per
   * segment, or per group — so the extreme is found by comparing values rather
   * than taking the first match, and every target holding that value comes
   * back. `intersection` targets are excluded by the type check: they are
   * neither a minimum nor a maximum, and their value would otherwise compete.
   * @param targets - The extrema targets reported by the trace.
   * @param type - Which extreme to collect.
   * @returns The tied targets, or an empty array when the trace reports none.
   */
  private static tiedExtremeTargets(
    targets: ExtremaTarget[],
    type: 'min' | 'max',
  ): ExtremaTarget[] {
    const candidates = targets.filter(
      target => target.type === type && Number.isFinite(target.value),
    );
    if (candidates.length === 0) {
      return [];
    }

    const extreme = candidates.reduce(
      (best, target) => (type === 'min'
        ? Math.min(best, target.value)
        : Math.max(best, target.value)),
      candidates[0].value,
    );
    return candidates.filter(target => target.value === extreme);
  }

  /**
   * Whether the trace's cursor already sits on a target.
   *
   * Mirrors what `navigateToExtrema` does with the target rather than tracking
   * position separately: a group target addresses a row and a column, and a
   * point target addresses a column of the current row. Reading it back this
   * way is what keeps the walk correct after the reader has moved by some
   * other means between presses.
   * @param trace - The trace to read the cursor from.
   * @param target - The target to compare against.
   * @returns True when the cursor is already on that target.
   */
  private static isCursorAt(trace: AbstractTrace, target: ExtremaTarget): boolean {
    if (target.navigationType === 'group'
      && target.groupIndex !== undefined
      && target.categoryIndex !== undefined) {
      return trace.row === target.groupIndex && trace.col === target.categoryIndex;
    }
    return trace.col === target.pointIndex;
  }
}
