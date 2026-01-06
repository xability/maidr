import type { MarkService } from '@service/mark';
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
 * Command to activate the MARK_JUMP scope for jumping to marks.
 */
export class ActivateMarkJumpScopeCommand implements Command {
  private readonly markService: MarkService;

  /**
   * Creates an instance of ActivateMarkJumpScopeCommand.
   * @param markService - The mark service
   */
  public constructor(markService: MarkService) {
    this.markService = markService;
  }

  /**
   * Activates the MARK_JUMP scope.
   */
  public execute(): void {
    this.markService.activateScope(Scope.MARK_JUMP);
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
 * Command to jump to a mark.
 */
export class JumpToMarkCommand implements Command {
  private readonly markService: MarkService;
  private readonly slot: number;

  /**
   * Creates an instance of JumpToMarkCommand.
   * @param markService - The mark service
   * @param slot - The slot number (0-9)
   */
  public constructor(markService: MarkService, slot: number) {
    this.markService = markService;
    this.slot = slot;
  }

  /**
   * Jumps to the mark at the specified slot.
   */
  public execute(): void {
    this.markService.jumpToMark(this.slot);
  }
}