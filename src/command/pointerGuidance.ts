import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { Command } from './command';

/**
 * Command that routes pointer/touch movement into guidance sonification.
 *
 * Instantiated directly by `Mousebindingservice` rather than through
 * `CommandFactory` because pointer events carry coordinates that the
 * keyboard-oriented factory contract does not accept. This is the only
 * input-driven command that needs that data, so the deviation is local.
 *
 * Two execution paths are exposed:
 * - {@link execute} — used by `pointermove` and `pointerleave`. Navigates
 *   to the nearest point and plays a directional guidance beep when
 *   off-curve, or resets guidance when no event is provided.
 * - {@link executeNavigateOnly} — used by `click`. Performs navigation
 *   only; the regular data sonification fires through the Observer chain
 *   on a successful move, and guidance beeps are suppressed so a click
 *   that lands between points does not produce an unexpected beep.
 */
export class PointerGuidanceCommand implements Command {
  private readonly context: Context;
  private readonly audioService: AudioService;

  /**
   * Creates an instance of PointerGuidanceCommand.
   *
   * @param context - Application context used for point navigation and guidance lookup
   * @param audioService - Audio service that renders guidance beeps
   */
  public constructor(context: Context, audioService: AudioService) {
    this.context = context;
    this.audioService = audioService;
  }

  /**
   * Executes pointer/touch guidance behavior.
   *
   * If an event with client coordinates is provided, updates nearest point
   * navigation and plays directional guidance. If no event is provided,
   * guidance is reset (equivalent to calling {@link reset}).
   *
   * @param event - Optional pointer/mouse event containing clientX/clientY
   */
  public execute(event?: Event): void {
    if (!event || !this.hasClientCoordinates(event)) {
      this.reset();
      return;
    }

    const { clientX, clientY } = event;
    const guidance = this.context.moveToPointAndGetPointerGuidance(clientX, clientY);
    this.audioService.playPointerGuidance(guidance);
  }

  /**
   * Clears any in-flight guidance state.
   *
   * Called when the pointer leaves the plot or when hover mode changes to
   * `none`, so the throttle (`nextPointerGuidanceBeepAt`) resets and no
   * stale beep is queued for a fresh entry.
   */
  public reset(): void {
    this.audioService.playPointerGuidance(null);
  }

  /**
   * Navigates to the nearest data point without playing a guidance beep.
   *
   * Used by `click` hover mode: a click should snap to and sonify a data
   * point via the standard Observer chain, never play an off-curve
   * directional beep (which is only meaningful for continuous exploration).
   *
   * @param event - Pointer/mouse event containing clientX/clientY
   */
  public executeNavigateOnly(event: Event): void {
    if (!this.hasClientCoordinates(event)) {
      return;
    }
    this.context.moveToPointAndGetPointerGuidance(event.clientX, event.clientY);
  }

  private hasClientCoordinates(
    event: Event,
  ): event is Event & { clientX: number; clientY: number } {
    const candidate = event as Partial<{ clientX: unknown; clientY: unknown }>;
    return typeof candidate.clientX === 'number' && typeof candidate.clientY === 'number';
  }
}
