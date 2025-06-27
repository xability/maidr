import type { CommandExecutor } from '@service/commandExecutor';
import type { ViewModelMap } from '@state/viewModel/registry';
import type { Keys, Scope } from '@type/event';
import { useViewModel } from '@state/hook/useViewModel';
import { useCallback, useEffect, useState } from 'react';

export function useCommandExecutor(): {
  executeCommand: (commandKey: Keys) => void;
  currentScope: Scope;
} {
  const commandExecutor = useViewModel('commandExecutor' as keyof ViewModelMap) as CommandExecutor;
  const [currentScope, setCurrentScope] = useState<Scope>(commandExecutor.getCurrentScope());

  useEffect(() => {
    const context = commandExecutor.getContext();
    const dispose = context.context.addScopeObserver((scope: Scope) => {
      setCurrentScope(scope);
    });

    return dispose;
  }, [commandExecutor]);

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
