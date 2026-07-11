import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { PlotState } from '@type/state';
import { focusedSubplotTitle } from '@model/plot';

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
 *  - TERSE: names the panel and, when authored, its title, e.g.
 *    "Figure, subplot 2, Sales" (or "Figure, subplot 2" when untitled) —
 *    dropping the "of N" framing to match the terse entry cue;
 *  - VERBOSE: "Returned to figure overview, subplot 2 of 4.".
 *
 * Shared by both exit paths (Esc in trace scope and Esc in braille mode) so
 * they stay consistent.
 *
 * @param text - The text service, for the current mode.
 * @param state - The figure lobby state returned to.
 * @param title - The focused subplot's authored title ('' when none).
 * @returns The message to announce, or `null` when text mode is OFF.
 */
export function subplotExitMessage(text: TextService, state: PlotState, title: string): string | null {
  if (text.isOff()) {
    return null;
  }
  const terse = text.isTerse();
  if (state.type === 'figure' && !state.empty) {
    if (terse) {
      return title
        ? `Figure, subplot ${state.index}, ${title}`
        : `Figure, subplot ${state.index}`;
    }
    return `Returned to figure overview, subplot ${state.index} of ${state.size}.`;
  }
  return terse ? 'Figure' : 'Returned to figure overview.';
}

/**
 * Command-layer collaborator that bundles the three services a subplot
 * transition needs for audible and spoken feedback: {@link AudioService}
 * (navigation tone), {@link TextService} (current text mode, consumed via the
 * pure message builders in this module) and {@link NotificationService} (the
 * spoken alert). It centralizes the repeated "play tone, build a mode-aware
 * message, notify when non-null" sequence so the three subplot-transition
 * commands stop each carrying — and growing — that trio.
 *
 * It is deliberately unaware of Context, braille state, and lobby gating: the
 * commands own those decisions and call the matching method. The enter tone is
 * exposed separately from the enter announcement because the braille-enabled
 * entry path plays the tone but suppresses the spoken alert. It owns no
 * resources, so it needs no dispose(); the wrapped services are owned and
 * disposed by the Controller.
 */
export class SubplotCue {
  private readonly audioService: AudioService;
  private readonly notificationService: NotificationService;
  private readonly textService: TextService;

  /**
   * Creates a SubplotCue.
   * @param {AudioService} audioService - Plays the enter/exit navigation tones.
   * @param {NotificationService} notificationService - Speaks the transition message.
   * @param {TextService} textService - Supplies the current text mode to the builders.
   */
  public constructor(
    audioService: AudioService,
    notificationService: NotificationService,
    textService: TextService,
  ) {
    this.audioService = audioService;
    this.notificationService = notificationService;
    this.textService = textService;
  }

  /**
   * Plays the "enter subplot" tone without announcing anything. Used on every
   * real lobby entry, including the braille-enabled path that suppresses the
   * spoken alert (to avoid clashing with the braille focus change) but still
   * cues the tone.
   */
  public playEnterTone(): void {
    this.audioService.playSubplotEnterTone();
  }

  /**
   * Announces which subplot was entered, respecting the current text mode
   * (OFF -> builder returns null -> no notify, so only the tone is heard).
   * Plays no tone: the caller plays it via {@link playEnterTone} so the tone
   * fires on both the braille and non-braille paths.
   * @param {number} index - 1-based visual position of the entered subplot.
   * @param {number} size - Total number of subplots in the figure.
   * @param {string} plotType - The entered trace's plot type ('' to omit).
   * @param {string} title - The entered subplot's authored title ('' when none).
   */
  public announceEntry(index: number, size: number, plotType: string, title: string): void {
    const message = subplotEntryMessage(this.textService, index, size, plotType, title);
    if (message) {
      this.notificationService.notify(message);
    }
  }

  /**
   * Full "returned to the figure lobby" cue: plays the exit tone, then (in
   * TERSE/VERBOSE mode) announces the lobby position; in OFF mode only the tone
   * plays. The caller must run the navigation transition (exitSubplot) BEFORE
   * calling this, so `state` reflects the lobby returned to. This method never
   * touches Context; the tone-before-notify ordering is preserved here while
   * the exit-before-notify ordering is preserved by the caller.
   * @param {PlotState} state - The figure lobby state returned to.
   */
  public announceExit(state: PlotState): void {
    this.audioService.playSubplotExitTone();
    const message = subplotExitMessage(this.textService, state, focusedSubplotTitle(state));
    if (message) {
      this.notificationService.notify(message);
    }
  }
}
