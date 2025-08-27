import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { AppStore } from '@state/store';
import type { ExtremaTarget } from '@type/extrema';
import type { TraceType } from '@type/grammar';
import type { TraceState } from '@type/state';
import type { XValue } from '@type/navigation';
import { AbstractTrace } from '@model/abstract';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

// Type for plots that support getAvailableXValues
interface PlotWithXValues {
  getAvailableXValues(): XValue[];
}

interface GoToExtremaState {
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

  public constructor(store: AppStore, goToExtremaService: GoToExtremaService, context: Context) {
    super(store);
    this.goToExtremaService = goToExtremaService;
    this.context = context;
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

      // Generate description based on current trace type
      const description = this.generateDescription(state.traceType);

      // Store the targets and description in the state
      this.store.dispatch(show({ targets: extremaTargets, description }));

      // Then change scope to show the modal
      this.goToExtremaService.toggle(state);
    }
  }

  public hide(): void {
    this.store.dispatch(hide());

    // Return scope to TRACE so plot navigation works again
    this.goToExtremaService.returnToTraceScope();
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
        activeTrace.navigateToExtrema(target);
        // Return scope and close modal after navigation
        this.hide();
      } catch (error) {
        this.hide();
      }
    } else {
      this.hide();
    }
  }

  /**
   * Generate description based on trace type
   * @param traceType The type of the current trace
   * @returns A description appropriate for the plot type
   */
  private generateDescription(traceType: TraceType): string {
    // Simple string replacement, no case statements
    return `Navigate to statistical extremes within the current ${traceType}`;
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
    return plot !== null && 
           typeof plot === 'object' && 
           'getAvailableXValues' in plot && 
           typeof (plot as any).getAvailableXValues === 'function';
  }
}

export default goToExtremaSlice.reducer;
