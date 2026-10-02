import type { LiveCommandChannel, LiveNavigator, LiveReaderProbe } from '@service/liveData';
import type { MaidrContextValue } from '@state/context';
import type { AppStore } from '@state/store';
import type { Keys } from '@type/event';
import type { Maidr as MaidrData, NavigationTarget } from '@type/grammar';
import type { RefObject } from 'react';
import type { ControllerSession } from '../../controller';
import { cloneMaidrData, liveDataManager } from '@service/liveData';
import { applyStoredLanguage } from '@service/settings';
import { LocalStorageService } from '@service/storage';
import { acquireWebMcpTools } from '@service/webMcp';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller } from '../../controller';

/** The most commands kept for a reader who is not in the chart. */
const MAX_PENDING_COMMANDS = 8;

/**
 * A dialog of any kind -- another chart's, or the page's own -- which keeps
 * the reader's focus until they close it, so nothing takes it from there.
 */
const DIALOG_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"]';

/**
 * How long each kept command waits behind the announcement before it: the
 * spacing an agent's own commands get, one per chart every 500 ms.
 */
const KEPT_COMMAND_INTERVAL_MS = 500;

/** A position kept for the reader's next focus-in, and who asked for it. */
interface KeptTarget {
  target: NavigationTarget;
  /** An agent asked, through the WebMCP tools, rather than the host page. */
  byAgent: boolean;
}

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
 * - Controller disposal on focus-out, keeping the reader's place and modes for
 *   the next focus-in
 * - The chart's live-data channels: moves and commands from the host page or
 *   an agent, made now or kept for the next focus-in, and the one keyboard
 *   focus move made for an agent -- into the chart, when the reader asked
 * - Timer cleanup and stale-closure prevention
 * - Unmount cleanup
 *
 * Returning to a hidden tab deliberately does nothing. Disposing and
 * rebuilding the controller there put the cursor back on the first point,
 * reset every slice (text, braille, any open dialog) and aborted an in-flight
 * chat answer along with the conversation -- all without an announcement,
 * because focus never left the figure and so no focus-in followed. A suspended
 * AudioContext needs no rebuild: `AudioService` defers its cues behind
 * `resume()` already.
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
  const keptCommandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [contextValue, setContextValue] = useState<MaidrContextValue | null>(null);

  // Latest chart data, kept current across prop changes and live updates
  // (window.maidrLive / liveDataManager). The controller is built from this
  // ref so a focus-in after an update always sees the freshest data.
  const latestDataRef = useRef<MaidrData>(data);

  // A position the host asked for while no controller was alive -- the mark a
  // sighted colleague clicked before the reader focused in, or the click that
  // took focus out of the figure and disposed the controller with it. Applied
  // on the next focus-in, so the reader arrives where the host is pointing,
  // and dropped when the data changes underneath it, since it addressed the
  // figure that data described. An agent's is marked as such, and dropped as
  // well when the reader switches agent access off; the host's stays. Each
  // new target replaces the last, whoever set either.
  const pendingTargetRef = useRef<KeptTarget | null>(null);

  // Commands asked for on the reader's behalf while they were away, in the
  // order asked, run on the next focus-in after a pending target -- with any
  // asked for while that focus-in is still running them. Unlike a
  // target they survive a data change: a live chart streams, and a mode
  // toggle addresses the reader's modes rather than a point of the old data.
  // They do not survive a change of chart id, which makes this another chart.
  const pendingCommandsRef = useRef<Keys[]>([]);

  // What the reader had when focus last left the figure -- their point and
  // their text, sound and braille modes. The controller holds global hotkeys,
  // so it cannot outlive focus-out; the next one is built from this instead,
  // so Tabbing to a control beside the chart and back does not start over.
  const sessionRef = useRef<ControllerSession | null>(null);

  // New data under a reader who is away: the saved point addressed the figure
  // the old data described, as a pending target does, so it goes with it.
  // Their modes are their own choices and stay.
  const forgetSessionPosition = useCallback((): void => {
    if (sessionRef.current !== null) {
      sessionRef.current = { ...sessionRef.current, navigation: null };
    }
  }, []);

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
    const ctrl = new Controller(cloneMaidrData(maidrData), plotElement, store, sessionRef.current);
    sessionRef.current = null;
    return ctrl;
  }, [store]);

  // Keep a ref to always access the latest createController, avoiding stale
  // closures when data changes between the time a timer is queued and fires.
  const createControllerRef = useRef(createController);
  createControllerRef.current = createController;

  // Whether the reader is here: the page has the browser's focus and the
  // figure has the page's. A controller outlives a window blur -- the reader
  // switching to the browser's agent panel leaves `document.activeElement`
  // where it was -- so its presence alone does not mean they would hear a move.
  const readerIsHere = useCallback((): boolean => {
    const figure = figureRef.current;
    return figure !== null && document.hasFocus() && figure.contains(document.activeElement);
  }, []);

  // The controller of a reader who is here.
  const readerController = useCallback(
    (): Controller | null => (readerIsHere() ? controllerRef.current : null),
    [readerIsHere],
  );

  const stopKeptCommands = useCallback((): void => {
    if (keptCommandTimerRef.current) {
      clearTimeout(keptCommandTimerRef.current);
      keptCommandTimerRef.current = null;
    }
  }, []);

  // Runs the kept commands one at a time, each behind the announcement before
  // it. Run back to back, each would replace the one before it in the live
  // region before React rendered it, and the reader would hear only the last
  // -- not where a kept target or their own return left them, nor any move
  // or mode change but the final one.
  const runKeptCommands = useCallback((): void => {
    stopKeptCommands();
    const step = (): void => {
      keptCommandTimerRef.current = null;
      const controller = readerController();
      const commands = pendingCommandsRef.current;
      // The reader left, or a kept target still waits -- braille reopened on
      // their return holds it: the rest wait for the focus-in that applies
      // it, so they still run after it.
      if (controller === null || pendingTargetRef.current !== null || commands.length === 0) {
        return;
      }
      // A dialog the reader opened meanwhile stops the run. Closing it hands
      // focus back to the plot, and that focus-in carries on.
      if (controller.runCommand(commands[0]) === 'blocked') {
        return;
      }
      // Run, or dropped as unavailable: its key would do nothing there either.
      commands.shift();
      if (commands.length > 0) {
        keptCommandTimerRef.current = setTimeout(step, KEPT_COMMAND_INTERVAL_MS);
      }
    };
    if (pendingCommandsRef.current.length > 0) {
      keptCommandTimerRef.current = setTimeout(step, KEPT_COMMAND_INTERVAL_MS);
    }
  }, [readerController, stopKeptCommands]);

  const disposeController = useCallback((): void => {
    stopKeptCommands();
    if (controllerRef.current) {
      controllerRef.current.suspendHighContrast();
      controllerRef.current.dispose();
      controllerRef.current = null;
    }
    setContextValue(null);
    hasAnnouncedRef.current = false;
  }, [stopKeptCommands]);

  // What a focus-in does once the events around it have settled: builds the
  // controller, tells the reader where they are, makes a kept move and starts
  // the kept commands.
  const enterFigure = useCallback((): void => {
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
      // A reader coming back hears the point they are on, not how to start.
      if (controllerRef.current?.resume() === false) {
        controllerRef.current.showInitialInstructionInText();
      }
    }
    // After the instruction, not instead of it: the instruction is shown
    // without an announcement, and the move that follows is the first
    // navigation, which is what turns announcements on.
    // Not under an open MAIDR dialog: a move there would switch the
    // keyboard scope beneath it. The target is kept for the focus-in that
    // follows the dialog closing and handing focus back to the plot.
    const pending = pendingTargetRef.current;
    const controller = controllerRef.current;
    if (pending !== null && controller !== null && !controller.isNavigationBlocked()) {
      pendingTargetRef.current = null;
      controller.navigateTo(pending.target);
    }
    // Then the kept commands, in order, each as the reader's own key would
    // run it and each heard on its own, starting once what was just
    // announced has been.
    if (controller !== null) {
      runKeptCommands();
    }
  }, [runKeptCommands]);

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
    focusInTimerRef.current = setTimeout(enterFigure, 0);
  }, [enterFigure]);

  // Takes the reader into the chart, because they asked an agent to: moves
  // keyboard focus to the plot, the element a Tab lands on, and enters at
  // once -- the focus-in that focus starts, without waiting the tick it
  // waits for a Tab -- so whoever asked can tell straight away whether the
  // reader arrived, and they hear what a Tab in would have told them.
  // `focus()` scrolls the plot into view only as far as the browser scrolls
  // for any focus, so a sighted helper beside the reader can see where they
  // are; nothing scrolls further. Never from a dialog, which keeps the
  // reader's focus until they close it -- this chart's, another chart's, or
  // the page's own -- and never away from somewhere else in the figure -- the
  // braille field, say -- which is already their place in it.
  //
  // Asked for even while the page does not have the browser's focus: a chart
  // in another page's frame, such as a chat host's, receives it that way.
  // When the page still does not have it -- the reader is in the browser's
  // own agent panel, which no page can take focus from -- nothing is entered
  // where they would not hear it. The browser may have put the page's own
  // focus on the plot, so the focus-in it fires when they come back makes
  // the move and runs the commands then.
  const bringReaderIn = useCallback((): void => {
    const plot = plotRef.current;
    const figure = figureRef.current;
    if (plot === null || figure === null || controllerRef.current?.isCommandBlocked() === true) {
      return;
    }
    const active = document.activeElement;
    if (!figure.contains(active)) {
      if (active?.closest(DIALOG_SELECTOR)) {
        return;
      }
      plot.focus();
      // Firefox gives a frame that did not have the browser's focus the
      // focus, but not the element in it; asked again, the element has it.
      if (document.hasFocus() && !figure.contains(document.activeElement)) {
        plot.focus();
      }
    }
    if (focusInTimerRef.current) {
      clearTimeout(focusInTimerRef.current);
      focusInTimerRef.current = null;
    }
    if (readerIsHere()) {
      enterFigure();
    }
  }, [enterFigure, readerIsHere]);

  const onFocusOut = useCallback((): void => {
    // Cancel any pending focus-in to prevent a stale focus-in from firing
    // after focus has already left the figure.
    if (focusInTimerRef.current) {
      clearTimeout(focusInTimerRef.current);
      focusInTimerRef.current = null;
    }
    // Kept commands run only while the reader is here; a focus that only
    // moved within the figure fires focus-in again, which carries on.
    stopKeptCommands();
    // Allow React to process all events before focusing out.
    focusOutTimerRef.current = setTimeout(() => {
      focusOutTimerRef.current = null;
      const figureElement = figureRef.current;
      if (!figureElement)
        return;

      const activeElement = document.activeElement as HTMLElement;
      const isInside = figureElement.contains(activeElement);
      if (!isInside) {
        // Only a live controller has anything newer to hand back. A focus
        // that came and went before one was built keeps the session it was
        // going to resume.
        if (controllerRef.current) {
          sessionRef.current = controllerRef.current.captureSession();
        }
        disposeController();
      }
    }, 0);
  }, [disposeController, stopKeptCommands]);

  // Speak the stored language from the first render, so the activation
  // instruction a screen reader announces before any focus-in is already in
  // it; the controller's own SettingsService takes over once it exists.
  //
  // Applied during render rather than in an effect: an effect runs after the
  // first commit, and the label is computed in that first render, so the
  // reader would meet one English frame before it changes. Setting a locale
  // that is already active notifies nobody, so a second chart on the page
  // costs nothing and re-renders nothing.
  const languageApplied = useRef(false);
  if (!languageApplied.current) {
    languageApplied.current = true;
    applyStoredLanguage(new LocalStorageService());
  }

  // Register this chart with the live data manager so external producers
  // (script-tag consumers via window.maidrLive, or React prop updates routed
  // through setData) can replace or append data at runtime. When an update
  // arrives while the chart is active, the controller swaps its model in
  // place, preserving the user's navigation position.
  useEffect(() => {
    latestDataRef.current = data;
    // A move made while the reader is not here waits, and is announced when
    // they come back (focus-in fires again on the element when the window
    // regains focus) -- or at once, when they asked to be taken there and
    // their focus can be brought in.
    const navigate: LiveNavigator = (target, { byAgent = false, focus = false } = {}) => {
      if (target === null) {
        // The host withdraws whatever waits; an agent -- or its tools being
        // switched off -- only what an agent left.
        if (!byAgent || pendingTargetRef.current?.byAgent === true) {
          pendingTargetRef.current = null;
        }
        return true;
      }
      const controller = readerController();
      if (controller !== null) {
        pendingTargetRef.current = null;
        return controller.navigateTo(target);
      }
      pendingTargetRef.current = { target, byAgent };
      // Kept first, so the entry makes the move as it makes any kept move.
      if (focus) {
        bringReaderIn();
      }
      return true;
    };
    const probe: LiveReaderProbe = () => {
      // Read at call time, by the same test the navigator moves on, so
      // "inChart" and a move made at once always agree.
      // "blocked" is read off any live controller: a dialog left open while
      // the reader is in the agent panel still blocks a move.
      const controller = readerController();
      return {
        inChart: controller !== null,
        position: controller?.getPositionText() ?? null,
        blocked: controllerRef.current?.isNavigationBlocked() ?? false,
      };
    };
    // Runs a command now by the same test the navigator moves on, or keeps it
    // for the next focus-in. A dialog left open while the reader is in the
    // agent panel refuses it, as it refuses a move, rather than keeping it to
    // run behind their back once they close it. A reader who is here while
    // their entry is still working through the kept commands gets it after
    // those, so each is heard in the order asked rather than this one cutting
    // in. Not while those wait on a kept target braille holds: this one may
    // be what closes braille, and would wait behind the wait it ends. The
    // state is read off any live controller, as "blocked" is above; with
    // none, from the session the reader left with, or the modes a first
    // visit starts with.
    const commands: LiveCommandChannel = {
      run: (command, { focus = false } = {}) => {
        if (controllerRef.current?.isCommandBlocked() === true) {
          return 'blocked';
        }
        const controller = readerController();
        if (controller !== null && keptCommandTimerRef.current === null) {
          return controller.runCommand(command);
        }
        if (pendingCommandsRef.current.length >= MAX_PENDING_COMMANDS) {
          return 'full';
        }
        pendingCommandsRef.current.push(command);
        // Kept first, so the entry runs it as it runs any kept command.
        if (focus && controller === null) {
          bringReaderIn();
        }
        // A reader in the chart -- all along, or just brought in -- gets it
        // in its turn; one who is not, when they next enter it.
        return readerController() === null ? 'kept' : 'queued';
      },
      state: () => {
        const controller = controllerRef.current;
        return {
          modes: controller?.getModes() ?? Controller.startingModes(sessionRef.current, latestDataRef.current),
          blocked: controller?.isCommandBlocked() ?? false,
          pending: pendingCommandsRef.current.length,
        };
      },
      clear: () => {
        pendingCommandsRef.current = [];
      },
    };
    const disposable = liveDataManager.register(data, (event) => {
      latestDataRef.current = event.maidr;
      pendingTargetRef.current = null;
      forgetSessionPosition();
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
    }, { navigator: navigate, probe, commands });
    // Experimental, off unless the page opts in; a no-op where the browser
    // has no WebMCP. Shared by every chart on the page (see webMcp.ts).
    const webMcp = acquireWebMcpTools(liveDataManager);
    return () => {
      webMcp.dispose();
      disposable.dispose();
      // Asked for under the id going away: under a new one this is another
      // chart, which nobody asked them of.
      pendingCommandsRef.current = [];
    };
    // Re-register only when the chart identity changes; data *content*
    // changes flow through the effect below.
  }, [bringReaderIn, data.id, disposeController, forgetSessionPosition, readerController]);

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
    pendingTargetRef.current = null;
    forgetSessionPosition();
    if (data.live) {
      liveDataManager.setData(data);
    } else {
      latestDataRef.current = data;
      liveDataManager.updateStoredData(data);
    }
  }, [data, forgetSessionPosition]);

  // Clean up pending timers and controller on unmount.
  useEffect(() => {
    return () => {
      if (focusInTimerRef.current)
        clearTimeout(focusInTimerRef.current);
      if (focusOutTimerRef.current)
        clearTimeout(focusOutTimerRef.current);
      if (keptCommandTimerRef.current)
        clearTimeout(keptCommandTimerRef.current);
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
