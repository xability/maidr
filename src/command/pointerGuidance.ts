import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { Command } from './command';

/**
 * Command that routes pointer/touch movement into guidance sonification.
 *
 * This keeps pointer input handling in the command flow rather than
 * calling AudioService directly from input-binding services.
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
   * guidance is reset (used for pointer leave / unregister).
   *
   * @param event - Optional pointer/mouse event containing clientX/clientY
   */
  public execute(event?: Event): void {
    if (!event || !this.hasClientCoordinates(event)) {
      this.audioService.playTouchGuidance(null);
      return;
    }

    const { clientX, clientY } = event;
    this.context.moveToPoint(clientX, clientY);

    const guidance = this.context.getTouchGuidance(clientX, clientY);
    this.audioService.playTouchGuidance(guidance);
  }

  private hasClientCoordinates(
    event: Event,
  ): event is Event & { clientX: number; clientY: number } {
    const candidate = event as Partial<{ clientX: unknown; clientY: unknown }>;
    return typeof candidate.clientX === 'number' && typeof candidate.clientY === 'number';
  }
}
