import { useCallback } from 'react';
import { useViewModel } from '@state/hook/useViewModel';
import { CommandFactory } from '@command/factory';
import { Keys } from '@type/event';
import type { ViewModelMap } from '@state/viewModel/registry';
import type { CommandExecutor } from '@service/commandExecutor';

export const useCommandExecutor = () => {
  const commandExecutor = useViewModel('commandExecutor' as keyof ViewModelMap) as CommandExecutor;
  const commandFactory = new CommandFactory(commandExecutor.getContext());

  const executeCommand = useCallback(
    (commandKey: Keys) => {
      const command = commandFactory.create(commandKey);
      command.execute();
    },
    [commandFactory]
  );

  const currentScope = commandExecutor.getCurrentScope();

  return {
    executeCommand,
    currentScope,
  };
};
