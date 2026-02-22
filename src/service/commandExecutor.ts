import type { CommandContext } from '@command/command';
import type { Disposable } from '@type/disposable';
import type { Keys, Scope } from '@type/event';
import { CommandFactory } from '@command/factory';
import { Emitter } from '@type/event';
import { SCOPED_KEYMAP } from './keybinding';

/**
 * Executes commands based on key bindings within the current scope.
 *
 * The current scope is always read live from the underlying Context,
 * so it stays in sync when Context.toggleScope() is called.
 * An Emitter is provided so React hooks can subscribe to scope changes.
 */
export class CommandExecutor implements Disposable {
  private readonly commandFactory: CommandFactory;
  private readonly commandContext: CommandContext;
  private readonly onScopeChangeEmitter = new Emitter<Scope>();
  private lastEmittedScope: Scope;

  /**
   * Event that fires when the current scope changes.
   * Subscribers (e.g. React hooks) can use this to reactively update.
   */
  public readonly onScopeChange = this.onScopeChangeEmitter.event;

  /**
   * Creates a new CommandExecutor instance.
   * @param {CommandContext} commandContext - The command execution context
   * @param {Scope} initialScope - The initial scope for command execution
   */
  public constructor(commandContext: CommandContext, initialScope: Scope) {
    this.commandFactory = new CommandFactory(commandContext);
    this.commandContext = commandContext;
    this.lastEmittedScope = initialScope;
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

      // After command execution, scope may have changed (e.g. toggle commands).
      // Check and notify subscribers if it did.
      this.emitIfScopeChanged();
    } catch (error) {
      console.error(`Failed to execute command ${commandKey}:`, error);
    }
  }

  /**
   * Gets the current scope from the live Context.
   * @returns {Scope} The current scope
   */
  public getCurrentScope(): Scope {
    return this.commandContext.context.scope;
  }

  /**
   * Checks whether the scope has changed since the last emission and fires
   * the onScopeChange event if so. Called after command execution.
   */
  private emitIfScopeChanged(): void {
    const currentScope = this.getCurrentScope();
    if (currentScope !== this.lastEmittedScope) {
      this.lastEmittedScope = currentScope;
      this.onScopeChangeEmitter.fire(currentScope);
    }
  }

  /**
   * Disposes the emitter resources.
   */
  public dispose(): void {
    this.onScopeChangeEmitter.dispose();
  }
}
