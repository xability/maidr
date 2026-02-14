import type { CommandContext } from '@command/command';
import type { Keys, Scope } from '@type/event';
import { CommandFactory } from '@command/factory';
import { SCOPED_KEYMAP } from './keybinding';

/**
 * Executes commands based on key bindings within the current scope.
 */
export class CommandExecutor {
  private readonly commandFactory: CommandFactory;
  private currentScope: Scope;
  private readonly context: CommandContext;

  /**
   * Creates a new CommandExecutor instance.
   * @param {CommandContext} commandContext - The command execution context
   * @param {Scope} initialScope - The initial scope for command execution
   */
  public constructor(commandContext: CommandContext, initialScope: Scope) {
    this.commandFactory = new CommandFactory(commandContext);
    this.currentScope = initialScope;
    this.context = commandContext;
  }

  /**
   * Gets the command execution context.
   * @returns {CommandContext} The command context
   */
  public getContext(): CommandContext {
    return this.context;
  }

  /**
   * Executes a command based on the provided key if it's valid for the current scope.
   * @param {Keys} commandKey - The key representing the command to execute
   */
  public executeCommand(commandKey: Keys): void {
    // Check if command is valid for current scope
    const scopeKeymap = SCOPED_KEYMAP[this.currentScope];
    if (!scopeKeymap || !(commandKey in scopeKeymap)) {
      return;
    }

    try {
      const command = this.commandFactory.create(commandKey);
      command.execute();
    } catch (error) {
      console.error(`Failed to execute command ${commandKey}:`, error);
    }
  }

  /**
   * Sets the current scope for command execution.
   * @param {Scope} scope - The new scope
   */
  public setScope(scope: Scope): void {
    this.currentScope = scope;
  }

  /**
   * Gets the current scope for command execution.
   * @returns {Scope} The current scope
   */
  public getCurrentScope(): Scope {
    return this.currentScope;
  }
}
