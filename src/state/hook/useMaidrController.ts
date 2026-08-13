import type { MaidrContextValue } from '@state/context';
import type { AppStore } from '@state/store';
import type { Maidr as MaidrData } from '@type/grammar';
import type { RefObject } from 'react';
import { cloneMaidrData, liveDataManager } from '@service/liveData';
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

  // Latest chart data, kept current across prop changes and live updates
  // (window.maidrLive / liveDataManager). The controller is built from this
  // ref so a focus-in after an update always sees the freshest data.
  const latestDataRef = useRef<MaidrData>(data);

  const createController = useCallback((): Controller | null => {
    const plotElement = plotRef.current;
    if (!plotElement)
      return null;

    // A subplot with zero layers crashes the model the moment Figure.state
    // is read (Subplot.activeTrace is undefined), which happens inside the
    // Controller constructor. Adapters emit such placeholder data before
    // their chart introspection completes or when no supported components
    // are found — treat it as "not ready" rather than constructing.
    const maidrData = latestDataRef.current;
    const hasLayers = maidrData.subplots?.some(
      row => row.some(subplot => subplot.layers.length > 0),
    );
    if (!hasLayers)
      return null;

    // Create a deep copy to prevent mutations on the original data object
    // (the model layer takes ownership of, and may mutate, the data arrays).
    const ctrl = new Controller(cloneMaidrData(maidrData), plotElement, store);
    return ctrl;
  }, [store]);

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
        if (!ctrl) {
          return;
        }
        controllerRef.current = ctrl;
        const cv = ctrl.getContextValue();
        setContextValue(cv);
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

  // Register this chart with the live data manager so external producers
  // (script-tag consumers via window.maidrLive, or React prop updates routed
  // through setData) can replace or append data at runtime. When an update
  // arrives while the chart is active, the controller swaps its model in
  // place, preserving the user's navigation position.
  useEffect(() => {
    latestDataRef.current = data;
    const disposable = liveDataManager.register(data, (event) => {
      latestDataRef.current = event.maidr;
      // In-place refresh is opt-in via `live: true`; static charts pick the
      // new data up on the next focus-in instead.
      if (event.maidr.live === true && controllerRef.current) {
        try {
          controllerRef.current.updateData(cloneMaidrData(event.maidr), event.appended);
        } catch (error) {
          // A failed swap can leave the model half-built; drop the controller
          // so the next focus-in rebuilds cleanly from the stored data.
          console.error('[maidr] Live data update failed; the chart will reload on next focus:', error);
          disposeController();
        }
      }
    });
    return () => disposable.dispose();
    // Re-register only when the chart identity changes; data *content*
    // changes flow through the effect below.
  }, [data.id, disposeController]);

  // React-driven data updates: for live charts, a new `data` prop replaces
  // the chart data in place (equivalent to setData). Static charts keep the
  // existing behavior — the new data is picked up on the next focus-in.
  //
  // Data ownership chain: prop changes on live charts route through
  // liveDataManager.setData, whose listener (above) is the single writer of
  // latestDataRef for live updates; non-live prop changes write latestDataRef
  // directly and only sync the manager's stored copy.
  const previousDataRef = useRef<MaidrData>(data);
  useEffect(() => {
    if (previousDataRef.current === data) {
      return;
    }
    previousDataRef.current = data;
    if (data.live) {
      liveDataManager.setData(data);
    } else {
      latestDataRef.current = data;
      liveDataManager.updateStoredData(data);
    }
  }, [data]);

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
