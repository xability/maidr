import type { MaidrContextValue } from '@state/context';
import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller } from '../../controller';

/**
 * Return type for the useMaidrController hook.
 */
interface UseMaidrControllerResult {
  /** Ref to attach to the plot wrapper div. */
  plotRef: RefObject<HTMLDivElement | null>;
  /** Ref to attach to the figure element. */
  figureRef: RefObject<HTMLElement | null>;
  /** The context value for React dependency injection, or null before focus-in. */
  contextValue: MaidrContextValue | null;
  /** Focus-in handler to attach to the figure element. */
  onFocusIn: () => void;
  /** Focus-out handler to attach to the figure element. */
  onFocusOut: () => void;
}

/**
 * Custom hook that manages the full Controller lifecycle for a MAIDR plot instance.
 *
 * Handles:
 * - Controller creation on focus-in (deferred -- no throwaway Controller on mount)
 * - Controller disposal on focus-out
 * - Visibility change re-creation
 * - Timer cleanup and stale-closure prevention
 * - Unmount cleanup
 *
 * @param data - The MAIDR configuration describing the plot
 * @param store - The per-instance Redux store
 * @returns Refs, context value, and event handlers for the component to wire up
 */
export function useMaidrController(data: MaidrData, store: AppStore): UseMaidrControllerResult {
  const plotRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const controllerRef = useRef<Controller | null>(null);
  const hasAnnouncedRef = useRef(false);
  const focusInTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [contextValue, setContextValue] = useState<MaidrContextValue | null>(null);

  const createController = useCallback((): Controller | null => {
    const plotElement = plotRef.current;
    if (!plotElement)
      return null;

    // Create a deep copy to prevent mutations on the original data object.
    const dataClone = structuredClone(data);
    const ctrl = new Controller(dataClone, plotElement, store);
    return ctrl;
  }, [data, store]);

  // Keep a ref to always access the latest createController, avoiding stale
  // closures when data changes between the time a timer is queued and fires.
  const createControllerRef = useRef(createController);
  createControllerRef.current = createController;

  const disposeController = useCallback((): void => {
    if (controllerRef.current) {
      controllerRef.current.suspendHighContrast();
      controllerRef.current.dispose();
      controllerRef.current = null;
    }
    setContextValue(null);
    hasAnnouncedRef.current = false;
  }, []);

  const onFocusIn = useCallback((): void => {
    // Cancel any pending focus-out to prevent dispose/create race.
    if (focusOutTimerRef.current) {
      clearTimeout(focusOutTimerRef.current);
      focusOutTimerRef.current = null;
    }
    // Cancel any previously queued focus-in to avoid duplicate timers.
    if (focusInTimerRef.current) {
      clearTimeout(focusInTimerRef.current);
      focusInTimerRef.current = null;
    }
    // Allow React to process all events before focusing in.
    focusInTimerRef.current = setTimeout(() => {
      focusInTimerRef.current = null;
      if (!controllerRef.current) {
        const ctrl = createControllerRef.current();
        if (!ctrl)
          return;
        controllerRef.current = ctrl;
        setContextValue(ctrl.getContextValue());
        ctrl.initializeHighContrast();
      }
      if (!hasAnnouncedRef.current) {
        hasAnnouncedRef.current = true;
        controllerRef.current?.showInitialInstructionInText();
      }
    }, 0);
  }, []);

  const onFocusOut = useCallback((): void => {
    // Cancel any pending focus-in to prevent a stale focus-in from firing
    // after focus has already left the figure.
    if (focusInTimerRef.current) {
      clearTimeout(focusInTimerRef.current);
      focusInTimerRef.current = null;
    }
    // Allow React to process all events before focusing out.
    focusOutTimerRef.current = setTimeout(() => {
      focusOutTimerRef.current = null;
      const figureElement = figureRef.current;
      if (!figureElement)
        return;

      const activeElement = document.activeElement as HTMLElement;
      const isInside = figureElement.contains(activeElement);
      if (!isInside) {
        disposeController();
      }
    }, 0);
  }, [disposeController]);

  const onVisibilityChange = useCallback((): void => {
    if (document.visibilityState === 'visible') {
      // Only recreate the controller if the chart previously had focus.
      // Without this guard, switching tabs would create a Controller for
      // every mounted <Maidr> instance, even ones never interacted with.
      if (!controllerRef.current)
        return;

      if (focusInTimerRef.current) {
        clearTimeout(focusInTimerRef.current);
        focusInTimerRef.current = null;
      }
      if (focusOutTimerRef.current) {
        clearTimeout(focusOutTimerRef.current);
        focusOutTimerRef.current = null;
      }
      disposeController();
      const ctrl = createControllerRef.current();
      if (!ctrl)
        return;
      controllerRef.current = ctrl;
      setContextValue(ctrl.getContextValue());
      ctrl.initializeHighContrast();
      hasAnnouncedRef.current = false;
    }
  }, [disposeController]);

  // Register visibility change listener.
  useEffect(() => {
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [onVisibilityChange]);

  // Clean up pending timers and controller on unmount.
  useEffect(() => {
    return () => {
      if (focusInTimerRef.current)
        clearTimeout(focusInTimerRef.current);
      if (focusOutTimerRef.current)
        clearTimeout(focusOutTimerRef.current);
      if (controllerRef.current) {
        controllerRef.current.suspendHighContrast();
        controllerRef.current.dispose();
        controllerRef.current = null;
      }
    };
  }, []);

  return {
    plotRef,
    figureRef,
    contextValue,
    onFocusIn,
    onFocusOut,
  };
}
