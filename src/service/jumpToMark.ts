import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import { Scope } from '@type/event';

/**
 * Service for managing the Jump to Mark dialog scope transitions.
 */
export class JumpToMarkService {
  private readonly context: Context;
  private readonly display: DisplayService;

  /**
   * Creates a new JumpToMarkService instance.
   * @param context - The application context
   * @param display - The display service for scope management
   */
  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  /**
   * Opens the Jump to Mark dialog by switching to MARK_JUMP scope.
   */
  public toggle(): void {
    // Ensure we're in MARK_JUMP scope to show the dialog
    if (this.context.scope !== Scope.MARK_JUMP) {
      this.display.toggleFocus(Scope.MARK_JUMP);
    }
  }

  /**
   * Closes the Jump to Mark dialog and returns to TRACE scope.
   */
  public returnToTraceScope(): void {
    // Ensure we return to TRACE scope
    if (this.context.scope !== Scope.TRACE) {
      this.display.toggleFocus(Scope.MARK_JUMP);
    }
  }
}
