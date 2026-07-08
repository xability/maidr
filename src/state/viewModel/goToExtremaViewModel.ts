import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { FormatterService } from '@service/formatter';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { AppStore } from '@state/store';
import type { ExtremaTarget } from '@type/extrema';
import type { TraceType } from '@type/grammar';
import type { XValue } from '@type/navigation';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

// Type for plots that support getAvailableXValues
interface PlotWithXValues {
  getAvailableXValues: () => XValue[];
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
  private readonly audioService: AudioService;
  private readonly formatter?: FormatterService;

  public constructor(
    store: AppStore,
    goToExtremaService: GoToExtremaService,
    context: Context,
    audioService: AudioService,
    formatter?: FormatterService,
  ) {
    super(store);
    this.goToExtremaService = goToExtremaService;
    this.context = context;
    this.audioService = audioService;
    this.formatter = formatter;
  }

  public dispose(): void {
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
      const formattedTargets = this.formatTargetLabels(extremaTargets, state.layerId);

      // Generate description based on current trace type
      const description = this.generateDescription(state.traceType);

      // Store the targets and description in the state
      this.store.dispatch(show({ targets: formattedTargets, description }));

      // Then change scope to show the modal
      this.goToExtremaService.toggle(state);

      // Play the "menu open" cue now that the modal is actually shown.
      this.audioService.playMenuOpenTone();
    }
  }

  public hide(): void {
    this.store.dispatch(hide());

    // Return scope to TRACE so plot navigation works again
    this.goToExtremaService.returnToTraceScope();

    // Play the "menu close" cue. Every user-initiated dismissal (backdrop, X
    // button, Esc, re-pressing G, selecting a target/option) funnels through
    // this method, so the cue fires exactly once per close. dispose() dispatches
    // the hide action directly (not via this method), so focus-out is silent.
    this.audioService.playMenuCloseTone();
  }

  public get activeContext(): Context {
    return this.context;
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
        this.handleTargetSelect(target as ExtremaTarget);
      }
    }
  }

  private handleTargetSelect(target: ExtremaTarget): void {
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
        // If navigation fails, ensure we're back in trace scope
        this.goToExtremaService.returnToTraceScope();
      }
    } else {
      this.goToExtremaService.returnToTraceScope();
    }
  }

  /**
   * Format extrema target labels by replacing raw xValues with formatted ones.
   * When no custom formatter is configured the labels pass through unchanged.
   */
  private formatTargetLabels(targets: ExtremaTarget[], layerId: string): ExtremaTarget[] {
    if (!this.formatter || !this.formatter.hasCustomFormatter(layerId, 'x')) {
      return targets;
    }

    return targets.map((target) => {
      if (target.xValue === undefined) {
        return target;
      }
      const formatted = this.formatter!.formatSingleValue(target.xValue, layerId, 'x');
      const raw = String(target.xValue);
      if (formatted === raw) {
        return target;
      }
      return {
        ...target,
        label: target.label.replaceAll(raw, formatted),
      };
    });
  }

  /**
   * Generate description based on trace type
   * @param traceType The type of the current trace
   * @returns A description appropriate for the plot type
   */
  private generateDescription(traceType: TraceType): string {
    return `Navigate to points of interest within the current ${traceType}`;
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
   * String(value) when no custom x formatter is configured for the active layer.
   * @returns Array of {value, label} options for the search combobox.
   */
  public getAvailableXValueOptions(): XValueOption[] {
    const rawValues = this.getAvailableXValues();
    if (rawValues.length === 0) {
      return [];
    }

    const layerId = this.activeLayerId();
    // Same gate the extrema target labels use (formatTargetLabels): pass through
    // unchanged when the active layer has no custom x formatter.
    if (!this.formatter || layerId === null || !this.formatter.hasCustomFormatter(layerId, 'x')) {
      return rawValues.map(value => ({ value, label: String(value) }));
    }

    return rawValues.map(value => ({
      value,
      label: this.formatter!.formatSingleValue(value, layerId, 'x'),
    }));
  }

  /**
   * Layer id of the active trace, or null when the active plot is not a
   * non-empty trace. The plot stack is unchanged while the modal is open (the
   * GO_TO_EXTREMA scope is a keyboard scope only), so context.state resolves to
   * the same trace whose X values are being listed.
   * @returns The active layer id, or null.
   */
  private activeLayerId(): string | null {
    const state = this.context.state;
    return state.type === 'trace' && !state.empty ? state.layerId : null;
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
}

export default goToExtremaSlice.reducer;
