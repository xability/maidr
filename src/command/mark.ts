import type { MarkService } from '@service/mark';
import type { JumpToMarkViewModel } from '@state/viewModel/jumpToMarkViewModel';
import type { Command } from './command';
import { Scope } from '@type/event';

/**
 * Command to activate the MARK_SET scope for setting marks.
 */
export class ActivateMarkSetScopeCommand implements Command {
  private readonly markService: MarkService;

  /**
   * Creates an instance of ActivateMarkSetScopeCommand.
   * @param markService - The mark service
   */
  public constructor(markService: MarkService) {
    this.markService = markService;
  }

  /**
   * Activates the MARK_SET scope.
   */
  public execute(): void {
    this.markService.activateScope(Scope.MARK_SET);
  }
}

/**
 * Command to activate the MARK_PLAY scope for playing marks.
 */
export class ActivateMarkPlayScopeCommand implements Command {
  private readonly markService: MarkService;

  /**
   * Creates an instance of ActivateMarkPlayScopeCommand.
   * @param markService - The mark service
   */
  public constructor(markService: MarkService) {
    this.markService = markService;
  }

  /**
   * Activates the MARK_PLAY scope.
   */
  public execute(): void {
    this.markService.activateScope(Scope.MARK_PLAY);
  }
}

/**
 * Command to activate the MARK_JUMP scope and open the jump dialog.
 */
export class ActivateMarkJumpScopeCommand implements Command {
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;

  /**
   * Creates an instance of ActivateMarkJumpScopeCommand.
   * @param jumpToMarkViewModel - The jump to mark view model
   */
  public constructor(jumpToMarkViewModel: JumpToMarkViewModel) {
    this.jumpToMarkViewModel = jumpToMarkViewModel;
  }

  /**
   * Opens the jump to mark dialog.
   */
  public execute(): void {
    this.jumpToMarkViewModel.toggle();
  }
}

/**
 * Command to deactivate mark scope and return to previous scope.
 */
export class DeactivateMarkScopeCommand implements Command {
  private readonly markService: MarkService;

  /**
   * Creates an instance of DeactivateMarkScopeCommand.
   * @param markService - The mark service
   */
  public constructor(markService: MarkService) {
    this.markService = markService;
  }

  /**
   * Deactivates the mark scope.
   */
  public execute(): void {
    this.markService.deactivateScope();
  }
}

/**
 * Command to set a mark at a specific slot.
 */
export class SetMarkCommand implements Command {
  private readonly markService: MarkService;
  private readonly slot: number;

  /**
   * Creates an instance of SetMarkCommand.
   * @param markService - The mark service
   * @param slot - The slot number (0-9)
   */
  public constructor(markService: MarkService, slot: number) {
    this.markService = markService;
    this.slot = slot;
  }

  /**
   * Sets a mark at the specified slot.
   */
  public execute(): void {
    this.markService.setMark(this.slot);
  }
}

/**
 * Command to play (describe) a mark without navigating.
 */
export class PlayMarkCommand implements Command {
  private readonly markService: MarkService;
  private readonly slot: number;

  /**
   * Creates an instance of PlayMarkCommand.
   * @param markService - The mark service
   * @param slot - The slot number (0-9)
   */
  public constructor(markService: MarkService, slot: number) {
    this.markService = markService;
    this.slot = slot;
  }

  /**
   * Plays the mark at the specified slot.
   */
  public execute(): void {
    this.markService.playMark(this.slot);
  }
}

/**
 * Command to move selection up in the jump to mark dialog.
 */
export class JumpToMarkMoveUpCommand implements Command {
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;

  public constructor(jumpToMarkViewModel: JumpToMarkViewModel) {
    this.jumpToMarkViewModel = jumpToMarkViewModel;
  }

  public execute(): void {
    this.jumpToMarkViewModel.moveUp();
  }
}

/**
 * Command to move selection down in the jump to mark dialog.
 */
export class JumpToMarkMoveDownCommand implements Command {
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;

  public constructor(jumpToMarkViewModel: JumpToMarkViewModel) {
    this.jumpToMarkViewModel = jumpToMarkViewModel;
  }

  public execute(): void {
    this.jumpToMarkViewModel.moveDown();
  }
}

/**
 * Command to select the current item in the jump to mark dialog.
 */
export class JumpToMarkSelectCommand implements Command {
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;

  public constructor(jumpToMarkViewModel: JumpToMarkViewModel) {
    this.jumpToMarkViewModel = jumpToMarkViewModel;
  }

  public execute(): void {
    this.jumpToMarkViewModel.selectCurrent();
  }
}

/**
 * Command to close the jump to mark dialog.
 */
export class JumpToMarkCloseCommand implements Command {
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;

  public constructor(jumpToMarkViewModel: JumpToMarkViewModel) {
    this.jumpToMarkViewModel = jumpToMarkViewModel;
  }

  public execute(): void {
    this.jumpToMarkViewModel.hide();
  }
}

/**
 * Command to jump directly to a specific mark slot from the dialog.
 */
export class JumpToSlotCommand implements Command {
  private readonly jumpToMarkViewModel: JumpToMarkViewModel;
  private readonly slot: number;

  public constructor(jumpToMarkViewModel: JumpToMarkViewModel, slot: number) {
    this.jumpToMarkViewModel = jumpToMarkViewModel;
    this.slot = slot;
  }

  public execute(): void {
    this.jumpToMarkViewModel.jumpToSlot(this.slot);
  }
}
