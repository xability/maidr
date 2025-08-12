import type { Context } from '@model/context';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { ExtremaJumpEvent, ExtremaObserver, ExtremaService, ExtremaType } from '@service/extrema';
import type { NotificationService } from '@service/notification';
import type { AppStore } from '../store';
import { createSlice } from '@reduxjs/toolkit';
import { AbstractViewModel } from './viewModel';

/**
 * UI state for the Go-To modal
 */
export interface GoToUiState {
  /** Whether the modal is visible */
  visible: boolean;
  /** Available extrema options */
  items: GoToItem[];
  /** Currently selected item index */
  selectedIndex: number;
  /** Error message if any */
  error: string | null;
}

/**
 * Represents an extrema option in the go-to list
 */
export interface GoToItem {
  /** Display label for the item */
  label: string;
  /** Type of extremum */
  type: ExtremaType;
  /** Current occurrence info (e.g., "1 of 3") */
  occurrenceInfo: string;
}

const initialState: GoToUiState = {
  visible: false,
  items: [],
  selectedIndex: 0,
  error: null,
};

const goToSlice = createSlice({
  name: 'goTo',
  initialState,
  reducers: {
    open(state, action: PayloadAction<{ items: GoToItem[] }>): void {
      state.visible = true;
      state.items = action.payload.items;
      state.selectedIndex = 0;
      state.error = null;
    },
    close(): GoToUiState {
      return initialState;
    },
    moveUp(state): void {
      if (state.items.length === 0)
        return;
      state.selectedIndex = state.selectedIndex > 0
        ? state.selectedIndex - 1
        : state.items.length - 1;
    },
    moveDown(state): void {
      if (state.items.length === 0)
        return;
      state.selectedIndex = state.selectedIndex < state.items.length - 1
        ? state.selectedIndex + 1
        : 0;
    },
    setError(state, action: PayloadAction<string>): void {
      state.error = action.payload;
    },
    reset(): GoToUiState {
      return initialState;
    },
  },
});

const { open, close, moveUp, moveDown, setError, reset } = goToSlice.actions;

/**
 * ViewModel for managing the Go-To extrema modal state and interactions.
 * Handles opening/closing the modal, managing selection, and coordinating
 * with the ExtremaService to jump to min/max points.
 */
export class GoToViewModel extends AbstractViewModel<GoToUiState> implements ExtremaObserver {
  private readonly context: Context;
  private readonly extremaService: ExtremaService;
  private readonly notificationService: NotificationService;

  // Current context for the modal
  private currentTraceId: string | null = null;
  private currentLineIndex: number = 0;
  private currentValues: number[] = [];

  public constructor(
    store: AppStore,
    context: Context,
    extremaService: ExtremaService,
    notificationService: NotificationService,
  ) {
    super(store);
    this.context = context;
    this.extremaService = extremaService;
    this.notificationService = notificationService;

    // Register as observer for extrema jump events
    this.extremaService.addObserver(this);
  }

  public get state(): GoToUiState {
    return this.store.getState().goTo;
  }

  /**
   * Open the go-to modal for a specific trace line
   * @param traceId Unique identifier for the trace
   * @param lineIndex Index of the line within the trace
   * @param values Array of values for the line
   */
  public open(traceId: string, lineIndex: number, values: number[]): void {
    if (values.length === 0) {
      const errorMsg = 'No data points available';
      this.store.dispatch(setError(errorMsg));
      this.notificationService.notify(errorMsg);
      return;
    }

    this.currentTraceId = traceId;
    this.currentLineIndex = lineIndex;
    this.currentValues = [...values];

    // Get available extrema types and build items
    const items = this.buildItems();

    if (items.length === 0) {
      const errorMsg = 'No extrema found';
      this.store.dispatch(setError(errorMsg));
      this.notificationService.notify(errorMsg);
      return;
    }

    this.store.dispatch(open({ items }));
  }

  /**
   * Close the go-to modal
   */
  public close(): void {
    this.store.dispatch(close());
    this.currentTraceId = null;
    this.currentLineIndex = 0;
    this.currentValues = [];
  }

  /**
   * Move selection up in the list
   */
  public moveUp(): void {
    this.store.dispatch(moveUp());
  }

  /**
   * Move selection down in the list
   */
  public moveDown(): void {
    this.store.dispatch(moveDown());
  }

  /**
   * Execute the currently selected extrema jump
   */
  public executeSelection(): void {
    const state = this.state;
    if (!this.currentTraceId || state.items.length === 0 || state.selectedIndex >= state.items.length) {
      return;
    }

    const selectedItem = state.items[state.selectedIndex];
    const pointIndex = this.extremaService.jumpToNextExtrema(
      this.context,
      this.currentTraceId,
      this.currentLineIndex,
      this.currentValues,
      selectedItem.type,
    );

    if (pointIndex !== -1) {
      // The service will emit an event that we'll handle in onExtremaJump
      this.close();
    } else {
      const errorMsg = 'Failed to jump to extremum';
      this.store.dispatch(setError(errorMsg));
      this.notificationService.notify(errorMsg);
    }
  }

  /**
   * Handle extrema jump events from the service
   */
  public onExtremaJump(event: ExtremaJumpEvent): void {
    // Format announcement for text/audio services
    const extremaTypeName = event.type === 'min' ? 'minimum' : 'maximum';

    let announcement: string;
    if (event.totalOccurrences > 1) {
      if (event.occurrenceIndex === 0) {
        // First jump to this extrema type
        announcement = `${event.totalOccurrences} ${extremaTypeName}${event.totalOccurrences > 1 ? 'a' : ''} found. Jumped to ${event.occurrenceIndex + 1} of ${event.totalOccurrences}.`;
      } else {
        // Subsequent jumps
        announcement = `${extremaTypeName.charAt(0).toUpperCase() + extremaTypeName.slice(1)} ${event.occurrenceIndex + 1} of ${event.totalOccurrences}`;
      }
    } else {
      // Single occurrence
      announcement = `Jumped to ${extremaTypeName}: ${event.value}`;
    }

    // Notify via notification service for accessibility
    this.notificationService.notify(announcement);
  }

  /**
   * Build the list of available extrema items
   */
  private buildItems(): GoToItem[] {
    const items: GoToItem[] = [];

    const availableTypes = this.extremaService.getAvailableExtremaTypes(this.currentValues);

    for (const type of availableTypes) {
      const occurrences = this.extremaService.getExtremaIndices(this.currentValues, type);
      const currentCursor = this.currentTraceId
        ? this.extremaService.getCurrentCursor(this.currentTraceId, this.currentLineIndex, type)
        : 0;

      const label = type === 'min' ? 'Minimum value' : 'Maximum value';
      const occurrenceInfo = occurrences.length > 1
        ? `${currentCursor + 1} of ${occurrences.length}`
        : `${occurrences[0]?.value ?? 'N/A'}`;

      items.push({
        label,
        type,
        occurrenceInfo,
      });
    }

    return items;
  }

  public dispose(): void {
    this.extremaService.removeObserver(this);
    this.store.dispatch(reset());
    super.dispose();
  }
}

export default goToSlice.reducer;
