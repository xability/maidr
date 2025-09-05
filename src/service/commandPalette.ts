import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import { Scope } from '@type/event';

export class CommandPaletteService {
  private readonly context: Context;
  private readonly display: DisplayService;

  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  public toggle(): void {
    // Change scope to COMMAND_PALETTE to show the modal
    if (this.context.scope !== Scope.COMMAND_PALETTE) {
      this.display.toggleFocus(Scope.COMMAND_PALETTE);
    }
  }

  public returnToTraceScope(): void {
    // Return to TRACE scope so plot navigation works again
    if (this.context.scope !== Scope.TRACE) {
      this.display.toggleFocus(Scope.COMMAND_PALETTE);
    }
  }
}
