import type { Context } from '@model/context';
import type { Figure, Subplot, Trace } from '@model/plot';
import type { AudioService } from '@service/audio';
import type { HighlightService } from '@service/highlight';
import type { NotificationService } from '@service/notification';
import type { StorageService } from '@service/storage';
import type { TextService } from '@service/text';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Disposable } from '@type/disposable';
import type { FigureMarks, Mark } from '@type/mark';
import type { TextState, TraceState } from '@type/state';
import { Scope } from '@type/event';
import { MARK_STORAGE_PREFIX } from '@type/mark';

/**
 * Service for managing mark and recall functionality.
 * Allows users to bookmark positions within plots and return to them later.
 */
export class MarkService implements Disposable {
  private readonly context: Context;
  private readonly figure: Figure;
  private readonly storage: StorageService;
  private readonly notification: NotificationService;
  private readonly audioService: AudioService;
  private readonly highlightService: HighlightService;
  private readonly brailleViewModel: BrailleViewModel;
  private readonly textViewModel: TextViewModel;
  private readonly textService: TextService;

  private figureMarks: FigureMarks;
  private previousScope: Scope;

  /**
   * Creates a new MarkService instance.
   * @param context - The application context
   * @param figure - The figure containing subplots and traces
   * @param storage - Storage service for persisting marks
   * @param notification - Notification service for announcements
   * @param audioService - Audio service for sonification
   * @param highlightService - Highlight service for visual feedback
   * @param brailleViewModel - Braille view model for braille output
   * @param textViewModel - Text view model for text output
   * @param textService - Text service for formatting mark descriptions
   */
  public constructor(
    context: Context,
    figure: Figure,
    storage: StorageService,
    notification: NotificationService,
    audioService: AudioService,
    highlightService: HighlightService,
    brailleViewModel: BrailleViewModel,
    textViewModel: TextViewModel,
    textService: TextService,
  ) {
    this.context = context;
    this.figure = figure;
    this.storage = storage;
    this.notification = notification;
    this.audioService = audioService;
    this.highlightService = highlightService;
    this.brailleViewModel = brailleViewModel;
    this.textViewModel = textViewModel;
    this.textService = textService;
    this.previousScope = Scope.TRACE;

    // Load marks for this figure from localStorage
    const storageKey = `${MARK_STORAGE_PREFIX}${context.id}`;
    const loaded = this.storage.load<FigureMarks>(storageKey);
    this.figureMarks = loaded ?? {
      figureId: context.id,
      marks: {},
    };
  }

  /**
   * Cleans up service resources.
   */
  public dispose(): void {
    // No resources to clean up
  }

  /**
   * Activates the specified mark scope.
   * @param scope - The mark scope to activate (MARK_SET, MARK_PLAY, or MARK_JUMP)
   */
  public activateScope(scope: Scope.MARK_SET | Scope.MARK_PLAY | Scope.MARK_JUMP): void {
    // Store the current scope so we can return to it
    this.previousScope = this.context.scope;
    this.context.toggleScope(scope);
  }

  /**
   * Deactivates mark scope and returns to the previous scope.
   */
  public deactivateScope(): void {
    this.context.toggleScope(this.previousScope);
  }

  /**
   * Sets a mark at the current position.
   * @param slot - The slot number (0-9)
   */
  public setMark(slot: number): void {
    const state = this.context.state;
    if (state.type !== 'trace') {
      this.notification.notify('Cannot set mark outside of trace context');
      this.deactivateScope();
      return;
    }

    if (state.empty) {
      this.notification.notify('Cannot set mark on empty position');
      this.deactivateScope();
      return;
    }

    const active = this.context.active as Trace;
    const isReplacing = this.figureMarks.marks[slot] != null;

    // Capture text in both modes for later display in jump dialog
    const terseText = this.generateMarkText(state, 'terse');
    const verboseText = this.generateMarkText(state, 'verbose');

    const mark: Mark = {
      traceId: active.getId(),
      row: active.row,
      col: active.col,
      terseText,
      verboseText,
    };

    this.figureMarks.marks[slot] = mark;
    this.saveMarks();

    const message = isReplacing
      ? `Replaced mark ${slot}`
      : `Marked position ${slot}`;
    this.notification.notify(message);
    this.deactivateScope();
  }

  /**
   * Generates text for a mark in the specified mode.
   * @param state - The trace state to format
   * @param mode - The text mode ('terse' or 'verbose')
   * @returns Formatted text string
   */
  private generateMarkText(state: TraceState, mode: 'terse' | 'verbose'): string {
    // Use the text service to format the state
    // The textService.format() uses current mode, so we need to format based on text state directly
    if (state.empty || !state.text) {
      return '';
    }

    const text = state.text;

    if (mode === 'verbose') {
      return this.formatVerboseText(text);
    } else {
      return this.formatTerseText(text);
    }
  }

  /**
   * Formats text state in verbose mode.
   */
  private formatVerboseText(text: TextState): string {
    const parts: string[] = [];

    // Main axis
    if (text.main) {
      const mainValue = Array.isArray(text.main.value)
        ? text.main.value.join(', ')
        : String(text.main.value);
      parts.push(`${text.main.label} is ${mainValue}`);
    }

    // Cross axis
    if (text.cross) {
      const crossValue = Array.isArray(text.cross.value)
        ? text.cross.value.join(', ')
        : String(text.cross.value);
      parts.push(`${text.cross.label} is ${crossValue}`);
    }

    // Fill
    if (text.fill) {
      parts.push(`${text.fill.label} is ${text.fill.value}`);
    }

    return parts.join(', ');
  }

  /**
   * Formats text state in terse mode.
   */
  private formatTerseText(text: TextState): string {
    const parts: string[] = [];

    // Main axis value
    if (text.main) {
      const mainValue = Array.isArray(text.main.value)
        ? `[${text.main.value.join(', ')}]`
        : String(text.main.value);
      parts.push(mainValue);
    }

    // Cross axis value
    if (text.cross) {
      const crossValue = Array.isArray(text.cross.value)
        ? `[${text.cross.value.join(', ')}]`
        : String(text.cross.value);
      parts.push(crossValue);
    }

    // Fill value
    if (text.fill) {
      parts.push(String(text.fill.value));
    }

    return parts.join(', ');
  }

  /**
   * Plays (describes) the marked position without navigating.
   * @param slot - The slot number (0-9)
   */
  public playMark(slot: number): void {
    const mark = this.figureMarks.marks[slot];

    if (!mark) {
      this.notification.notify(`Mark ${slot} is empty`);
      this.deactivateScope();
      return;
    }

    // Find the trace
    const trace = this.findTraceById(mark.traceId);
    if (!trace) {
      this.notification.notify(`Mark ${slot} references invalid trace`);
      this.deactivateScope();
      return;
    }

    // Save original position
    const originalRow = trace.row;
    const originalCol = trace.col;

    // Temporarily move to marked position to get state
    trace.row = mark.row;
    trace.col = mark.col;
    const state = trace.state as TraceState;

    // Restore original position
    trace.row = originalRow;
    trace.col = originalCol;

    // Announce the mark number first
    this.notification.notify(`Mark ${slot}`);

    // Then update all modalities with the marked state (like DescribePointCommand)
    if (!state.empty) {
      this.textViewModel.update(state);
      this.audioService.update(state);
      this.brailleViewModel.update(state);
      this.highlightService.update(state);
    }

    this.deactivateScope();
  }

  /**
   * Jumps to the marked position.
   * @param slot - The slot number (0-9)
   */
  public jumpToMark(slot: number): void {
    const mark = this.figureMarks.marks[slot];

    if (!mark) {
      this.notification.notify(`Mark ${slot} is empty`);
      this.deactivateScope();
      return;
    }

    // Navigate to the trace and position
    const success = this.navigateToMark(mark);

    if (success) {
      this.notification.notify(`Jumped to mark ${slot}`);
    } else {
      this.notification.notify(`Failed to jump to mark ${slot}`);
    }
    this.deactivateScope();
  }

  /**
   * Finds a trace by its ID within the figure.
   * @param traceId - The trace ID to find
   * @returns The trace if found, null otherwise
   */
  private findTraceById(traceId: string): Trace | null {
    for (const subplotRow of this.figure.subplots) {
      for (const subplot of subplotRow) {
        for (const traceRow of subplot.traces) {
          for (const trace of traceRow) {
            if (trace.getId() === traceId) {
              return trace;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Finds the subplot and position of a trace by ID.
   * @param traceId - The trace ID to find
   * @returns Object with subplot and trace position, or null if not found
   */
  private findTracePosition(traceId: string): {
    subplot: Subplot;
    subplotRow: number;
    subplotCol: number;
    traceRow: number;
    traceCol: number;
  } | null {
    for (let sr = 0; sr < this.figure.subplots.length; sr++) {
      for (let sc = 0; sc < this.figure.subplots[sr].length; sc++) {
        const subplot = this.figure.subplots[sr][sc];
        for (let tr = 0; tr < subplot.traces.length; tr++) {
          for (let tc = 0; tc < subplot.traces[tr].length; tc++) {
            if (subplot.traces[tr][tc].getId() === traceId) {
              return {
                subplot,
                subplotRow: sr,
                subplotCol: sc,
                traceRow: tr,
                traceCol: tc,
              };
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Navigates to a mark, switching traces if necessary.
   * @param mark - The mark to navigate to
   * @returns True if navigation succeeded, false otherwise
   */
  private navigateToMark(mark: Mark): boolean {
    const position = this.findTracePosition(mark.traceId);
    if (!position) {
      return false;
    }

    const { subplot, traceRow, traceCol } = position;
    const targetTrace = subplot.traces[traceRow][traceCol];

    // Check if we need to switch traces
    const currentActive = this.context.active;
    const currentTraceId = 'getId' in currentActive
      ? (currentActive as Trace).getId()
      : null;

    if (currentTraceId !== mark.traceId) {
      // Need to switch traces - update subplot's active trace position
      subplot.row = traceRow;
      subplot.col = traceCol;

      // Update the plotContext stack to point to the new trace
      // We need to access the private plotContext through the context
      // Since we can't directly access it, we use moveToIndex on the new trace
      // which will automatically notify observers
    }

    // Move to the marked position within the trace
    // This will trigger notifyStateUpdate() and update all observers
    targetTrace.moveToIndex(mark.row, mark.col);

    return true;
  }

  /**
   * Persists marks to localStorage.
   */
  private saveMarks(): void {
    const storageKey = `${MARK_STORAGE_PREFIX}${this.context.id}`;
    this.storage.save(storageKey, this.figureMarks);
  }

  /**
   * Gets all set marks for display in the jump dialog.
   * @returns Array of marks with their slot numbers, sorted by slot
   */
  public getSetMarks(): Array<{ slot: number; mark: Mark }> {
    const marks: Array<{ slot: number; mark: Mark }> = [];

    for (let slot = 0; slot <= 9; slot++) {
      const mark = this.figureMarks.marks[slot];
      if (mark) {
        marks.push({ slot, mark });
      }
    }

    return marks;
  }

  /**
   * Checks if a specific slot has a mark set.
   * @param slot - The slot number (0-9)
   * @returns True if the slot has a mark, false otherwise
   */
  public hasMarkAtSlot(slot: number): boolean {
    return this.figureMarks.marks[slot] != null;
  }

  /**
   * Gets the current text mode from the text service.
   * @returns True if verbose mode, false if terse mode
   */
  public isVerboseMode(): boolean {
    return this.textService.isVerbose();
  }
}