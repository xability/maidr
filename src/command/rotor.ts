import type { Command, CommandContext } from './command';

/**
 * Command to cycle to the next rotor navigation unit
 */
export class RotorNextCommand implements Command {
  private readonly commandContext: CommandContext;

  public constructor(commandContext: CommandContext) {
    this.commandContext = commandContext;
  }

  public execute(): void {
    this.commandContext.rotorNavigationService.cycleNext();
  }
}

/**
 * Command to cycle to the previous rotor navigation unit
 */
export class RotorPrevCommand implements Command {
  private readonly commandContext: CommandContext;

  public constructor(commandContext: CommandContext) {
    this.commandContext = commandContext;
  }

  public execute(): void {
    this.commandContext.rotorNavigationService.cyclePrev();
  }
}
