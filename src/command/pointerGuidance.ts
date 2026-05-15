import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { Command } from './command';
import { Scope } from '@type/event';

/**
 * Routes pointer/touch movement into guidance sonification.
 *
 * Constructed directly by `Mousebindingservice` rather than through
 * `CommandFactory`: pointer events carry coordinates the keyboard-oriented
 * factory contract does not accept. Because of that bypass, the scope check
 * in {@link isInTraceScope} duplicates `CommandExecutor.isValidForScope` —
 * keep the two in sync if scope validation evolves.
 */
export class PointerGuidanceCommand implements Command {
  private readonly context: Context;
  private readonly audioService: AudioService;

  constructor(context: Context, audioService: AudioService) {
    this.context = context;
    this.audioService = audioService;
  }

  /**
   * Handles a pointermove / pointerleave event: navigates to the nearest
   * point and plays a directional beep when off-curve, or resets guidance
   * when called with no event. No-ops outside `Scope.TRACE` so guidance
   * stays silent while modals or other scopes own input.
   */
  public execute(event?: Event): void {
    // Pointer-leave / missing-coordinate paths always reset so stale
    // throttle state from a prior trace-scope hover doesn't leak.
    if (!event || !this.hasClientCoordinates(event)) {
      this.reset();
      return;
    }
    if (!this.isInTraceScope()) {
      return;
    }

    const { clientX, clientY } = event;
    const guidance = this.context.moveToPointAndGetPointerGuidance(clientX, clientY);
    this.audioService.playPointerGuidance(guidance);
  }

  /** Clears in-flight guidance and the throttle so a fresh entry starts clean. */
  public reset(): void {
    this.audioService.playPointerGuidance(null);
  }

  /**
   * Click-mode entry point: snaps to the nearest point without a guidance
   * beep, leaving the regular Observer-chain sonification to fire. The
   * runtime coordinate check stays despite the narrowed parameter type
   * because exotic event subclasses can still arrive at the listener.
   */
  public executeNavigateOnly(event: PointerEvent | MouseEvent): void {
    if (!this.isInTraceScope() || !this.hasClientCoordinates(event)) {
      return;
    }
    this.context.moveToPointAndGetPointerGuidance(event.clientX, event.clientY);
  }

  private isInTraceScope(): boolean {
    return this.context.scope === Scope.TRACE;
  }

  private hasClientCoordinates(
    event: Event,
  ): event is Event & { clientX: number; clientY: number } {
    const candidate = event as Partial<{ clientX: unknown; clientY: unknown }>;
    return typeof candidate.clientX === 'number' && typeof candidate.clientY === 'number';
  }
}
