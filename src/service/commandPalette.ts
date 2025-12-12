import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import { Scope } from '@type/event';

/**
 * Service for managing the command palette modal interface.
 */
export class CommandPaletteService {
  private readonly context: Context;
  private readonly display: DisplayService;

  /**
   * Creates a new CommandPaletteService instance.
   * @param {Context} context - The application context
   * @param {DisplayService} display - The display service for managing UI focus
   */
  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  /**
   * Toggles the command palette modal to show or hide it.
   */
  public toggle(): void {
    // Change scope to COMMAND_PALETTE to show the modal
    if (this.context.scope !== Scope.COMMAND_PALETTE) {
      this.display.toggleFocus(Scope.COMMAND_PALETTE);
    }
  }

  /**
   * Returns focus to the TRACE scope to enable plot navigation.
   */
  public returnToTraceScope(): void {
    // Return to TRACE scope so plot navigation works again
    if (this.context.scope !== Scope.TRACE) {
      this.display.toggleFocus(Scope.COMMAND_PALETTE);
    }
  }
}
