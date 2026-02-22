import type { Keys, Scope } from '@type/event';
import { useMaidrContext } from '@state/context';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Custom hook that provides command execution functionality and current scope.
 * Retrieves the CommandExecutor from the MAIDR context (per-instance DI).
 * The scope is subscribed to reactively via useSyncExternalStore so that
 * components re-render when the scope changes (e.g. switching from TRACE
 * to BRAILLE mode).
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

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const disposable = commandExecutor.onScopeChange(onStoreChange);
      return () => disposable.dispose();
    },
    [commandExecutor],
  );

  const getSnapshot = useCallback(
    () => commandExecutor.getCurrentScope(),
    [commandExecutor],
  );

  const currentScope = useSyncExternalStore(subscribe, getSnapshot);

  return {
    executeCommand,
    currentScope,
  };
}
