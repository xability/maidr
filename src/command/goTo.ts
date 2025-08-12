import type { Context } from '@model/context';
import type { GoToViewModel } from '@state/viewModel/goToViewModel';
import type { Command } from './command';

/**
 * Command to open the Go-To extrema modal for the current trace.
 * Only works when the current context is a trace (line plot).
 */
export class GoToCommand implements Command {
  private readonly context: Context;
  private readonly goToViewModel: GoToViewModel;

  public constructor(context: Context, goToViewModel: GoToViewModel) {
    this.context = context;
    this.goToViewModel = goToViewModel;
  }

  public execute(): void {
    const state = this.context.state;

    // Only allow go-to navigation in trace context
    if (state.type !== 'trace' || state.empty) {
      return;
    }

    // Check if this is a line trace by checking the braille state for lineValues
    if (!('braille' in state) || state.braille.empty || !('values' in state.braille)) {
      return;
    }

    const brailleState = state.braille;
    const lineValues = brailleState.values as number[][];
    const currentRow = brailleState.row;

    if (currentRow < 0 || currentRow >= lineValues.length) {
      return;
    }

    const currentLineValues = lineValues[currentRow];

    if (currentLineValues.length === 0) {
      return;
    }

    // Generate a trace ID for the extrema service
    const traceId = brailleState.id || `trace_${currentRow}`;

    // Open the go-to modal
    this.goToViewModel.open(traceId, currentRow, currentLineValues);
  }
}
