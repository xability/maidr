import type { Context } from '@model/context';
import type { GoToExtremaService } from '@service/goToExtrema';
import type { AppStore } from '@state/store';
import type { TraceState } from '@type/state';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';
import { TraceType } from '@type/grammar';

interface GoToExtremaState {
  visible: boolean;
  targets: any[];
  selectedIndex: number;
}

const initialState: GoToExtremaState = {
  visible: false,
  targets: [],
  selectedIndex: 0,
};

const goToExtremaSlice = createSlice({
  name: 'goToExtrema',
  initialState,
  reducers: {
    show(_, action): GoToExtremaState {
      return {
        visible: true,
        targets: action.payload,
        selectedIndex: 0,
      };
    },
    hide(): GoToExtremaState {
      const newState = {
        visible: false,
        targets: [],
        selectedIndex: 0,
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

    if (state.traceType !== TraceType.CANDLESTICK) {
      return;
    }

    // Get the active trace (should be a candlestick)
    const activeTrace = this.context.active;

    if (activeTrace && 'getExtremaTargets' in activeTrace) {
      // Get extrema targets from the plot class
      const extremaTargets = (activeTrace as any).getExtremaTargets();

      // Store the targets in the state first
      this.store.dispatch(show(extremaTargets));

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
      const newIndex = Math.max(0, (currentState.selectedIndex || 0) - 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  public moveDown(): void {
    const currentState = this.state;

    if (currentState.targets.length > 0) {
      const newIndex = Math.min(currentState.targets.length - 1, (currentState.selectedIndex || 0) + 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  public selectCurrent(): void {
    const currentState = this.state;

    if (currentState.targets.length > 0 && currentState.selectedIndex !== undefined) {
      const target = currentState.targets[currentState.selectedIndex];
      this.handleTargetSelect(target);
    }
  }

  private handleTargetSelect(target: any): void {
    // Get the active trace and navigate to the selected target
    const activeTrace = this.context.active;

    if (activeTrace && 'navigateToExtrema' in activeTrace) {
      try {
        (activeTrace as any).navigateToExtrema(target);
      } catch (error) {
        console.error('Error calling navigateToExtrema:', error);
      }
    }

    this.hide();
  }
}

export default goToExtremaSlice.reducer;
