import type { CommandExecutor } from '@service/commandExecutor';
import type { Keys, Scope } from '@type/event';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { useCallback, useState } from 'react';

export function useCommandExecutor(): {
  executeCommand: (commandKey: Keys) => void;
  currentScope: Scope;
} {
  // Get CommandExecutor from the registry
  const commandExecutor = ViewModelRegistry.instance.get('commandExecutor') as CommandExecutor;
  const [currentScope] = useState<Scope>(commandExecutor.getCurrentScope());

  const executeCommand = useCallback(
    (commandKey: Keys) => {
      commandExecutor.executeCommand(commandKey);
    },
    [commandExecutor],
  );

  return {
    executeCommand,
    currentScope,
  };
}
