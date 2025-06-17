import type { CommandContext } from '@command/command';
import type { Keys } from '@type/event';
import { CommandFactory } from '@command/factory';
import { Scope } from '@type/event';
import { SCOPED_KEYMAP } from './keybinding';

export class CommandExecutor {
  private readonly commandFactory: CommandFactory;
  private currentScope: Scope;
  private readonly context: CommandContext;

  public constructor(commandContext: CommandContext, initialScope: Scope) {
    this.commandFactory = new CommandFactory(commandContext);
    this.currentScope = initialScope;
    this.context = commandContext;

    // Listen for scope changes in the context
    commandContext.context.addScopeObserver((scope: Scope) => {
      this.currentScope = scope;
    });
  }

  public getContext(): CommandContext {
    return this.context;
  }

  public executeCommand(commandKey: Keys): void {
    // Check if command is valid for current scope
    const scopeKeymap = SCOPED_KEYMAP[this.currentScope];
    if (!scopeKeymap || !(commandKey in scopeKeymap)) {
      console.warn(`Command ${commandKey} is not available in scope ${this.currentScope}`);
      return;
    }

    try {
      const command = this.commandFactory.create(commandKey);
      command.execute();
    } catch (error) {
      console.error(`Failed to execute command ${commandKey}:`, error);
    }
  }

  public setScope(scope: Scope): void {
    this.currentScope = scope;
  }

  public getCurrentScope(): Scope {
    return this.currentScope;
  }
}
