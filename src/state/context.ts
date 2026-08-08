import type { CommandExecutor } from '@service/commandExecutor';
import type { ViewModelRegistry } from '@state/viewModel/registry';
import { createContext, useContext } from 'react';

/**
 * Values provided to the MAIDR React component tree via context.
 * This replaces global singletons with per-instance dependency injection.
 */
export interface MaidrContextValue {
  /** The view model registry for this MAIDR plot instance. */
  viewModelRegistry: ViewModelRegistry;
  /** The command executor for this MAIDR plot instance. */
  commandExecutor: CommandExecutor;
}

/**
 * React Context for injecting per-instance dependencies into the MAIDR component tree.
 * Each MAIDR plot instance provides its own context value, ensuring state isolation.
 */
export const MaidrContext = createContext<MaidrContextValue | null>(null);

/**
 * Hook to access the MAIDR context value.
 * Must be used within a MaidrContext.Provider.
 * @throws Error if used outside of a MaidrContext.Provider
 */
export function useMaidrContext(): MaidrContextValue {
  const ctx = useContext(MaidrContext);
  if (!ctx) {
    throw new Error(
      'useMaidrContext must be used within a MaidrContext.Provider. '
      + 'Ensure the component is rendered inside a <Maidr> component.',
    );
  }
  return ctx;
}
