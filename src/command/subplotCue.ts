import type { TextService } from '@service/text';
import type { PlotState } from '@type/state';

/**
 * Builds the spoken cue for entering a subplot from the multi-panel figure
 * lobby, respecting the current text mode:
 *  - OFF: `null` (the enter tone alone signals the transition);
 *  - TERSE: the panel and, when authored, its title, e.g. "Subplot 2, Sales"
 *    (or just "Subplot 2" when the subplot has no title) — dropping the
 *    "of N" position framing so the confirmation stays quick;
 *  - VERBOSE: the full transition, e.g. "Entered subplot 2 of 4, bar plot.".
 *
 * @param text - The text service, for the current mode.
 * @param index - 1-based visual position of the entered subplot.
 * @param size - Total number of subplots in the figure.
 * @param plotType - The entered trace's plot type ('' to omit).
 * @param title - The entered subplot's authored title ('' when none).
 * @returns The message to announce, or `null` when text mode is OFF.
 */
export function subplotEntryMessage(
  text: TextService,
  index: number,
  size: number,
  plotType: string,
  title: string,
): string | null {
  if (text.isOff()) {
    return null;
  }
  if (text.isTerse()) {
    return title ? `Subplot ${index}, ${title}` : `Subplot ${index}`;
  }
  const suffix = plotType ? `, ${plotType} plot` : '';
  return `Entered subplot ${index} of ${size}${suffix}.`;
}

/**
 * Builds the spoken cue for returning from a subplot to the figure lobby,
 * respecting the current text mode:
 *  - OFF: `null` (the exit tone alone signals the transition);
 *  - TERSE: "Figure, subplot 2 of 4";
 *  - VERBOSE: "Returned to figure overview, subplot 2 of 4.".
 *
 * Shared by both exit paths (Esc in trace scope and Esc in braille mode) so
 * they stay consistent.
 *
 * @param text - The text service, for the current mode.
 * @param state - The figure lobby state returned to.
 * @returns The message to announce, or `null` when text mode is OFF.
 */
export function subplotExitMessage(text: TextService, state: PlotState): string | null {
  if (text.isOff()) {
    return null;
  }
  const terse = text.isTerse();
  if (state.type === 'figure' && !state.empty) {
    return terse
      ? `Figure, subplot ${state.index} of ${state.size}`
      : `Returned to figure overview, subplot ${state.index} of ${state.size}.`;
  }
  return terse ? 'Figure' : 'Returned to figure overview.';
}
