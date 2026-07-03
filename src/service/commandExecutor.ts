import type { CommandContext } from '@command/command';
import type { Disposable } from '@type/disposable';
import type { Keys, Scope } from '@type/event';
import { CommandFactory } from '@command/factory';
import { SCOPED_KEYMAP } from './keybinding';

/**
 * Executes commands based on key bindings within the current scope.
 *
 * The current scope is always read live from the underlying Context,
 * so it stays in sync when Context.toggleScope() is called.
 */
export class CommandExecutor implements Disposable {
  private readonly commandFactory: CommandFactory;
  private readonly commandContext: CommandContext;

  /**
   * Creates a new CommandExecutor instance.
   * @param {CommandContext} commandContext - The command execution context
   */
  public constructor(commandContext: CommandContext) {
    this.commandFactory = new CommandFactory(commandContext);
    this.commandContext = commandContext;
  }

  /**
   * Gets the command execution context.
   * @returns {CommandContext} The command context
   */
  public getContext(): CommandContext {
    return this.commandContext;
  }

  /**
   * Executes a command based on the provided key if it's valid for the current scope.
   * @param {Keys} commandKey - The key representing the command to execute
   */
  public executeCommand(commandKey: Keys): void {
    const currentScope = this.getCurrentScope();
    // Check if command is valid for current scope
    const scopeKeymap = SCOPED_KEYMAP[currentScope];
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
   * Gets the current scope from the live Context.
   * @returns {Scope} The current scope
   */
  private getCurrentScope(): Scope {
    return this.commandContext.context.scope;
  }

  /**
   * No resources to release; kept so the Controller's uniform
   * dispose sequence can treat every registered component alike.
   */
  public dispose(): void {}
}
