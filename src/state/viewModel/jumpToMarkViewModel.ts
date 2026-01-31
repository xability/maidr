import type { Context } from '@model/context';
import type { JumpToMarkService } from '@service/jumpToMark';
import type { MarkService } from '@service/mark';
import type { AppStore } from '@state/store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from '@state/viewModel/viewModel';

/**
 * Represents a mark item for display in the dialog.
 */
export interface MarkItem {
  slot: number;
  terseText: string;
  verboseText: string;
}

/**
 * State interface for the Jump to Mark dialog.
 */
interface JumpToMarkState {
  visible: boolean;
  marks: MarkItem[];
  selectedIndex: number;
}

const initialState: JumpToMarkState = {
  visible: false,
  marks: [],
  selectedIndex: 0,
};

const jumpToMarkSlice = createSlice({
  name: 'jumpToMark',
  initialState,
  reducers: {
    show(state, action): JumpToMarkState {
      return {
        visible: true,
        marks: action.payload.marks,
        selectedIndex: 0,
      };
    },
    hide(): JumpToMarkState {
      return {
        visible: false,
        marks: [],
        selectedIndex: 0,
      };
    },
    updateSelectedIndex(state, action): JumpToMarkState {
      return {
        ...state,
        selectedIndex: action.payload,
      };
    },
  },
});

const { show, hide, updateSelectedIndex } = jumpToMarkSlice.actions;

/**
 * ViewModel for managing the Jump to Mark dialog state and behavior.
 */
export class JumpToMarkViewModel extends AbstractViewModel<JumpToMarkState> {
  private readonly jumpToMarkService: JumpToMarkService;
  private readonly markService: MarkService;
  private readonly context: Context;

  /**
   * Creates a new JumpToMarkViewModel instance.
   * @param store - The Redux store
   * @param jumpToMarkService - Service for managing scope transitions
   * @param markService - Service for accessing marks
   * @param context - The application context
   */
  public constructor(
    store: AppStore,
    jumpToMarkService: JumpToMarkService,
    markService: MarkService,
    context: Context,
  ) {
    super(store);
    this.jumpToMarkService = jumpToMarkService;
    this.markService = markService;
    this.context = context;
  }

  /**
   * Disposes the view model and hides the dialog.
   */
  public dispose(): void {
    super.dispose();
    this.store.dispatch(hide());
  }

  /**
   * Gets the current state.
   */
  public get state(): JumpToMarkState {
    return this.store.getState().jumpToMark;
  }

  /**
   * Opens the Jump to Mark dialog.
   */
  public toggle(): void {
    // Get all set marks from the mark service
    const setMarks = this.markService.getSetMarks();

    // Convert to MarkItem format
    const marks: MarkItem[] = setMarks.map(({ slot, mark }) => ({
      slot,
      terseText: mark.terseText || '',
      verboseText: mark.verboseText || '',
    }));

    // Show the dialog with marks
    this.store.dispatch(show({ marks }));

    // Switch to MARK_JUMP scope to show the dialog
    this.jumpToMarkService.toggle();
  }

  /**
   * Hides the Jump to Mark dialog and returns to trace scope.
   */
  public hide(): void {
    this.store.dispatch(hide());
    this.jumpToMarkService.returnToTraceScope();
  }

  /**
   * Moves selection up in the mark list.
   */
  public moveUp(): void {
    const currentState = this.state;
    if (currentState.marks.length > 0) {
      const newIndex = Math.max(0, currentState.selectedIndex - 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  /**
   * Moves selection down in the mark list.
   */
  public moveDown(): void {
    const currentState = this.state;
    if (currentState.marks.length > 0) {
      const newIndex = Math.min(currentState.marks.length - 1, currentState.selectedIndex + 1);
      this.store.dispatch(updateSelectedIndex(newIndex));
    }
  }

  /**
   * Selects the currently highlighted mark and jumps to it.
   */
  public selectCurrent(): void {
    const currentState = this.state;
    if (currentState.marks.length > 0 && currentState.selectedIndex < currentState.marks.length) {
      const selectedMark = currentState.marks[currentState.selectedIndex];
      this.jumpToSlot(selectedMark.slot);
    }
  }

  /**
   * Jumps directly to a specific mark slot.
   * @param slot - The slot number (0-9)
   */
  public jumpToSlot(slot: number): void {
    // Check if the slot has a mark
    if (!this.markService.hasMarkAtSlot(slot)) {
      // Do nothing for empty slots
      return;
    }

    // Hide the dialog first
    this.store.dispatch(hide());

    // Return to trace scope
    this.jumpToMarkService.returnToTraceScope();

    // Jump to the mark
    this.markService.jumpToMark(slot);
  }

  /**
   * Gets whether the text service is in verbose mode.
   */
  public isVerboseMode(): boolean {
    return this.markService.isVerboseMode();
  }

  /**
   * Gets the display text for a mark based on current text mode.
   * @param mark - The mark item
   * @returns The appropriate text (terse or verbose)
   */
  public getMarkDisplayText(mark: MarkItem): string {
    return this.isVerboseMode() ? mark.verboseText : mark.terseText;
  }
}

export default jumpToMarkSlice.reducer;
