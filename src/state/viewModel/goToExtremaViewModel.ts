import type { Context } from '@model/context';
import type { FormatterService } from '@service/formatter';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { AppStore } from '@state/store';
import type { ExtremaTarget } from '@type/extrema';
import type { TraceType } from '@type/grammar';
import type { XValue } from '@type/navigation';
import type { AxisType, TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { t } from '@util/i18n';

// Type for plots that support getAvailableXValues
interface PlotWithXValues {
  getAvailableXValues: () => XValue[];
}

// Type for plots that can be moved to a chosen X value
interface PlotWithMoveToXValue {
  moveToXValue: (value: XValue) => boolean;
}

/**
 * An X value paired with its display label. `value` is the raw XValue used for
 * navigation (moveToXValue matches on the raw value); `label` is the x-axis
 * formatted string that is shown, filtered, and announced in the search
 * combobox so it matches the terse layer text and the extrema target labels.
 */
export interface XValueOption {
  value: XValue;
  label: string;
}

export interface GoToExtremaState {
  visible: boolean;
  targets: any[];
  selectedIndex: number;
  description: string; // Add description field
}

const initialState: GoToExtremaState = {
  visible: false,
  targets: [],
  selectedIndex: 0,
  description: '', // Initialize description
};

const goToExtremaSlice = createSlice({
  name: 'goToExtrema',
  initialState,
  reducers: {
    show(state, action): GoToExtremaState {
      return {
        visible: true,
        targets: action.payload.targets,
        selectedIndex: 0,
        description: action.payload.description, // Store description
      };
    },
    hide(): GoToExtremaState {
      const newState = {
        visible: false,
        targets: [],
        selectedIndex: 0,
        description: '',
      };
      return newState;
    },
    updateSelectedIndex(state, action): GoToExtremaState {
      return {
        ...state,
        selectedIndex: action.payload,
      };
    },
  },
});

const { show, hide, updateSelectedIndex } = goToExtremaSlice.actions;

export class GoToExtremaViewModel extends AbstractViewModel<GoToExtremaState> {
  private readonly goToExtremaService: GoToExtremaService;
  private readonly context: Context;
  private readonly formatter?: FormatterService;

  public constructor(
    store: AppStore,
    goToExtremaService: GoToExtremaService,
    context: Context,
    formatter?: FormatterService,
  ) {
    super(store);
    this.goToExtremaService = goToExtremaService;
    this.context = context;
    this.formatter = formatter;
  }

  public override dispose(): void {
    super.dispose();
    this.store.dispatch(hide());
  }

  public get state(): GoToExtremaState {
    return this.store.getState().goToExtrema;
  }

  public toggle(state: TraceState): void {
    if (state.empty) {
      return;
    }

    // Get the active trace
    const activeTrace = this.context.active;

    // Check if the trace supports extrema navigation using the service
    if (activeTrace && this.goToExtremaService.isExtremaNavigable(activeTrace)) {
      // Get extrema targets from the plot class
      const extremaTargets = activeTrace.getExtremaTargets();

      // Apply formatting to target labels using FormatterService
      const formattedTargets = this.formatTargetXValues(
        extremaTargets,
        state.layerId,
        state.text.mainAxis ?? 'x',
      );

      // Generate description based on current trace type
      const description = this.generateDescription(state.traceType);

      // Store the targets and description in the state
      this.store.dispatch(show({ targets: formattedTargets, description }));

      // Then change scope to show the modal. The scope change is what plays
      // the shared "menu open" cue, from DisplayViewModel.
      this.goToExtremaService.toggle(state);
    }
  }

  public hide(): void {
    this.store.dispatch(hide());

    // Return scope to TRACE so plot navigation works again. Leaving the
    // GO_TO_EXTREMA scope is what plays the shared "menu close" cue, from
    // DisplayViewModel, so every dismissal path sounds it exactly once.
    this.goToExtremaService.returnToTraceScope();
  }

  public moveUp(): void {
    const currentState = this.state;

    if (currentState.targets.length > 0) {
      const prevIndex = currentState.selectedIndex || 0;
      const newIndex = Math.max(0, prevIndex - 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  public moveDown(): void {
    const currentState = this.state;

    if (currentState.targets.length > 0) {
      // Include search option at index = targets.length
      const maxIndex = currentState.targets.length;
      const prevIndex = currentState.selectedIndex || 0;
      const newIndex = Math.min(maxIndex, prevIndex + 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  /**
   * Moves the selection to an explicit index (WAI-ARIA Home/End support).
   * Clamps to [0, targets.length]; targets.length is the virtual search option,
   * mirroring moveDown()'s upper bound so any valid position is addressable.
   * @param index - The target selection index.
   */
  public moveToIndex(index: number): void {
    const currentState = this.state;

    if (currentState.targets.length > 0) {
      const maxIndex = currentState.targets.length; // includes virtual search option
      const clamped = Math.max(0, Math.min(maxIndex, index));
      this.store.dispatch(updateSelectedIndex(clamped));
    }
  }

  public selectCurrent(): void {
    const currentState = this.state;

    if (currentState.targets.length > 0 && currentState.selectedIndex !== undefined) {
      const target = currentState.targets[currentState.selectedIndex];
      if (target) {
        this.selectTarget(target as ExtremaTarget);
      }
    }
  }

  /**
   * Closes the dialog and navigates the active trace to a chosen target.
   *
   * The only way into the model from the dialog, so every selection path — a
   * click, an Enter in the listbox, the hotkey — closes and moves in the same
   * order and gets the same guard. A trace can advertise extrema support
   * without implementing the jump (the base `navigateToExtrema` throws), which
   * would otherwise leave the reader in the GO_TO_EXTREMA scope with the
   * dialog open and nothing announced.
   * @param target - The extrema target to navigate to.
   */
  public selectTarget(target: ExtremaTarget): void {
    // Get the active trace and navigate to the selected target
    const activeTrace = this.context.active;

    if (activeTrace && this.goToExtremaService.isExtremaNavigable(activeTrace)) {
      try {
        // Hide the modal (dispatches hide, restores TRACE scope, plays the
        // close cue) before navigating so the scope change and cue happen once.
        this.hide();

        // Then navigate to the target
        activeTrace.navigateToExtrema(target);
      } catch (error) {
        // If navigation fails, ensure we're back in trace scope. Log it: the
        // reader sees the dialog close and nothing move, which is
        // indistinguishable from a target that was simply already current.
        console.error('[GoToExtremaViewModel] navigating to an extremum failed', error);
        this.goToExtremaService.returnToTraceScope();
      }
    } else {
      this.goToExtremaService.returnToTraceScope();
    }
  }

  /**
   * Closes the dialog and moves the active trace to a chosen X value.
   *
   * The search half of {@link selectTarget}, guarded the same way so a trace
   * that cannot honour the move cannot strand the reader in the dialog.
   * @param value - The raw X value to move to.
   * @returns True when the trace could be moved, false when it offers no
   * X-value navigation and the dialog was therefore left alone.
   */
  public moveToXValue(value: XValue): boolean {
    const activeTrace = this.context.active;

    if (!this.supportsMoveToXValue(activeTrace)) {
      return false;
    }

    try {
      this.hide();
      activeTrace.moveToXValue(value);
    } catch (error) {
      console.error('[GoToExtremaViewModel] moving to an x value failed', error);
      this.goToExtremaService.returnToTraceScope();
    }
    return true;
  }

  /**
   * Writes each target's x value the way the layer's formatter does.
   *
   * Every layer is formatted, not only those with an author-supplied
   * `AxisFormat`: the default formatter rounds a long float to two decimals,
   * which is what the announcement says, and a dialog line that disagreed with
   * the announcement for the same point would be worse than either.
   *
   * Only `display.x` is rewritten, and only when it is `xValue` written out:
   * a target whose position reads differently from its raw x (a point label
   * of its own, say) keeps what the trace wrote. `label`, the sentence, is
   * left alone — the dialog composes its line from the parts, and the parts
   * are what the reader hears.
   *
   * `axis` is the trace's main axis, not always 'x': a horizontal trace reports
   * its category as `xValue` while that category lives on the y axis, and the
   * announcement for the same point formats it with the y formatter. Formatting
   * here with 'x' applied the value axis's format to a category, which is the
   * dialog/announcement disagreement this method exists to avoid.
   * @param targets - The extrema targets as the trace built them.
   * @param layerId - The layer whose formatters apply.
   * @param axis - The axis the trace reports its main value on.
   * @returns The targets, with their x values formatted.
   */
  private formatTargetXValues(
    targets: ExtremaTarget[],
    layerId: string,
    axis: AxisType,
  ): ExtremaTarget[] {
    const formatter = this.formatter;
    if (!formatter) {
      return targets;
    }

    return targets.map((target) => {
      const x = target.display?.x;
      if (target.xValue === undefined || x === undefined || x !== String(target.xValue)) {
        return target;
      }
      const formatted = formatter.formatSingleValue(target.xValue, layerId, axis);
      if (formatted === x) {
        return target;
      }
      return { ...target, display: { ...target.display, x: formatted } };
    });
  }

  /**
   * Generate description based on trace type
   * @param traceType The type of the current trace
   * @returns A description appropriate for the plot type
   */
  private generateDescription(traceType: TraceType): string {
    return t('dialogs.extremaDescription', { traceType });
  }

  /**
   * Get available X values from the active trace for search functionality
   * @returns Array of X values that can be searched/navigated to
   */
  public getAvailableXValues(): XValue[] {
    const activeTrace = this.context.active;
    if (activeTrace && this.supportsXValueNavigation(activeTrace)) {
      return (activeTrace as PlotWithXValues).getAvailableXValues();
    }
    return [];
  }

  /**
   * Get available X values paired with their display label. `value` is the raw
   * XValue (navigation matches on it); `label` is the x-axis formatted string so
   * the search options read the same as the terse layer text and the extrema
   * target labels (e.g. "Nov 3" rather than the raw "2019-11-03"). Falls back to
   * String(value) only when no formatter was injected or the active layer has
   * no id — every known layer is formatted, configured or not.
   * @returns Array of {value, label} options for the search combobox.
   */
  public getAvailableXValueOptions(): XValueOption[] {
    const rawValues = this.getAvailableXValues();
    if (rawValues.length === 0) {
      return [];
    }

    const formatter = this.formatter;
    const layer = this.activeLayerFormat();
    // Same rule the extrema target labels follow (formatTargetXValues): format
    // whenever there is a formatter and a layer to look it up by, so these
    // labels round the way the announcement does.
    if (!formatter || layer === null) {
      return rawValues.map(value => ({ value, label: String(value) }));
    }

    // String()-coerce the formatter output (custom `function` formatters are
    // built via new Function and only nominally return a string) so the label
    // is always safe to call string methods on downstream, matching the
    // tolerance of formatTargetXValues.
    return rawValues.map(value => ({
      value,
      label: String(formatter.formatSingleValue(value, layer.layerId, layer.axis)),
    }));
  }

  /**
   * Layer id and main-axis identity of the active trace, or null when the
   * active plot is not a non-empty trace. The plot stack is unchanged while the
   * modal is open (the GO_TO_EXTREMA scope is a keyboard scope only), so
   * context.state resolves to the same trace whose X values are being listed.
   *
   * The axis is the trace's own main axis rather than always 'x', for the
   * reason formatTargetXValues gives: on a horizontal trace the value listed
   * here is the category, and the category sits on y.
   * @returns The active layer id and its main axis, or null.
   */
  private activeLayerFormat(): { layerId: string; axis: AxisType } | null {
    const state = this.context.state;
    if (state.type !== 'trace' || state.empty) {
      return null;
    }
    return { layerId: state.layerId, axis: state.text.mainAxis ?? 'x' };
  }

  /**
   * Check if a trace supports extrema navigation
   * @param trace The trace to check
   * @returns True if the trace supports extrema navigation
   */
  public isExtremaNavigable(trace: unknown): boolean {
    return this.goToExtremaService.isExtremaNavigable(trace);
  }

  /**
   * Check if a plot supports X value navigation
   * @param plot The plot to check
   * @returns True if the plot supports getAvailableXValues
   */
  private supportsXValueNavigation(plot: unknown): plot is PlotWithXValues {
    return plot !== null
      && typeof plot === 'object'
      && 'getAvailableXValues' in plot
      && typeof (plot as any).getAvailableXValues === 'function';
  }

  /**
   * Check if a plot can be moved to a chosen X value
   * @param plot The plot to check
   * @returns True if the plot supports moveToXValue
   */
  private supportsMoveToXValue(plot: unknown): plot is PlotWithMoveToXValue {
    return plot !== null
      && typeof plot === 'object'
      && 'moveToXValue' in plot
      && typeof (plot as any).moveToXValue === 'function';
  }
}

export default goToExtremaSlice.reducer;
