import type { AudioService } from '@service/audio';
import type { NotificationService } from '@service/notification';
import type { TextService } from '@service/text';
import type { PlotState } from '@type/state';
import { focusedSubplotTitle } from '@model/plot';

/**
 * Command-layer collaborator that bundles the three services a subplot
 * transition needs for audible and spoken feedback: {@link AudioService}
 * (navigation tone), {@link TextService} (which owns the mode-aware transition
 * wording) and {@link NotificationService} (the spoken alert). It centralizes
 * the repeated "play tone, build a mode-aware message, notify when non-null"
 * sequence so the three subplot-transition commands stop each carrying — and
 * growing — that trio.
 *
 * The terse/verbose message wording itself lives in TextService
 * ({@link TextService.subplotEntryText} / {@link TextService.subplotExitText}),
 * next to the lobby navigation text, so all lobby wording shares one home; this
 * collaborator only orchestrates tone + notify.
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
   * @param {TextService} textService - Builds the mode-aware transition message.
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
   * (OFF -> TextService returns null -> no notify, so only the tone is heard).
   * Plays no tone: the caller plays it via {@link playEnterTone} so the tone
   * fires on both the braille and non-braille paths.
   * @param {number} index - 1-based visual position of the entered subplot.
   * @param {number} size - Total number of subplots in the figure.
   * @param {string} plotType - The entered trace's plot type ('' to omit).
   * @param {string} title - The entered subplot's authored title ('' when none).
   */
  public announceEntry(index: number, size: number, plotType: string, title: string): void {
    const message = this.textService.subplotEntryText(index, size, plotType, title);
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
    const message = this.textService.subplotExitText(state, focusedSubplotTitle(state));
    if (message) {
      this.notificationService.notify(message);
    }
  }
}
