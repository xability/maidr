import type { Keys, Scope } from '@type/event';
import { useMaidrContext } from '@state/context';
import { useCallback } from 'react';

/**
 * Custom hook that provides command execution functionality and current scope.
 * Retrieves the CommandExecutor from the MAIDR context (per-instance DI).
 * The scope is read directly from the CommandExecutor on each render to
 * avoid stale state from a one-time useState initialization.
 * @returns Object containing executeCommand function and currentScope
 */
export function useCommandExecutor(): {
  executeCommand: (commandKey: Keys) => void;
  currentScope: Scope;
} {
  const { commandExecutor } = useMaidrContext();

  const executeCommand = useCallback(
    (commandKey: Keys) => {
      commandExecutor.executeCommand(commandKey);
    },
    [commandExecutor],
  );

  return {
    executeCommand,
    currentScope: commandExecutor.getCurrentScope(),
  };
}
