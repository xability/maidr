import type {
  CandlestickDeltaCandle,
  CandlestickDeltaField,
} from '@model/candlestickDelta';
import type { Context } from '@model/context';
import type { Trace } from '@model/plot';
import type { Disposable } from '@type/disposable';
import type { LinePoint, MaidrLayer } from '@type/grammar';
import type { XValue } from '@type/navigation';
import type { DisplayService } from './display';
import type { NotificationService } from './notification';
import type { RotorNavigationService } from './rotor';
import { Candlestick } from '@model/candlestick';
import { CandlestickDeltaTrace } from '@model/candlestickDelta';
import { LineTrace } from '@model/line';
import { Scope } from '@type/event';
import { TraceType } from '@type/grammar';

/** A selectable reference series (one line of a line layer) for comparison. */
export interface CandlestickDeltaReference {
  /** Stable option id: `{layer id}:{series index}`. */
  id: string;
  /** Human-readable series name (e.g., "Moving Average 3 days"). */
  label: string;
}

/**
 * Manages the virtual candlestick delta layer: discovers reference lines in
 * the active subplot, remembers the user's chosen reference line, builds the
 * {@link CandlestickDeltaTrace} on demand, swaps it in/out of the navigation
 * context, and announces activation and exit.
 *
 * Interaction model:
 * - Ctrl+Shift+L opens the reference picker; confirming a line remembers it as
 *   the reference and activates the comparison.
 * - Alt+L toggles the comparison on/off using the remembered reference. The
 *   very first Alt+L with no reference chosen yet warns and opens the picker.
 */
export class CandlestickDeltaService implements Disposable {
  private readonly context: Context;
  private readonly notification: NotificationService;
  private readonly display: DisplayService;
  private readonly rotor: RotorNavigationService;

  /** Wires the standard trace observers onto a runtime-created trace. */
  private wireTrace: ((trace: Trace) => void) | null = null;

  private deltaTrace: CandlestickDeltaTrace | null = null;
  /** The real trace the delta layer replaced; restored on exit. */
  private anchor: Trace | null = null;
  /** The reference line remembered across on/off toggles. */
  private selectedReferenceId: string | null = null;

  public constructor(
    context: Context,
    notification: NotificationService,
    display: DisplayService,
    rotor: RotorNavigationService,
  ) {
    this.context = context;
    this.notification = notification;
    this.display = display;
    this.rotor = rotor;
  }

  public dispose(): void {
    this.deltaTrace?.dispose();
    this.deltaTrace = null;
    this.anchor = null;
    this.selectedReferenceId = null;
    this.wireTrace = null;
  }

  /**
   * Injects the observer wiring used for runtime-created traces. The
   * Controller owns the services that must observe a trace (audio, braille,
   * text, review, highlight), so it supplies this hook after construction.
   * @param wireTrace - Callback registering all trace observers
   */
  public setObserverWirer(wireTrace: (trace: Trace) => void): void {
    this.wireTrace = wireTrace;
  }

  /** Whether the virtual delta layer is the active navigation target. */
  public get isActive(): boolean {
    return this.deltaTrace !== null && this.context.active === this.deltaTrace;
  }

  /** The remembered reference line id, or null when none has been chosen. */
  public get selectedReference(): string | null {
    return this.selectedReferenceId;
  }

  /**
   * Lists the reference series available for comparison in the current
   * subplot, or null when the feature does not apply here (the active trace
   * is not a candlestick, or no line layer exists alongside it).
   * @returns The selectable references, or null when unavailable
   */
  public getReferences(): CandlestickDeltaReference[] | null {
    if (!this.resolveCandlestick()) {
      return null;
    }

    const references: CandlestickDeltaReference[] = [];
    for (const trace of this.context.getActiveSubplotTraces()) {
      if (!(trace instanceof LineTrace)) {
        continue;
      }
      trace.getSeries().forEach((series, index) => {
        references.push({
          id: `${trace.getId()}:${index}`,
          label: series.label,
        });
      });
    }
    return references.length > 0 ? references : null;
  }

  /** Moves keyboard focus into the reference picker dialog scope. */
  public openSettings(): void {
    this.display.toggleFocus(Scope.CANDLESTICK_DELTA_SETTINGS);
  }

  /** Closes the reference picker dialog scope, returning to the previous scope. */
  public closeSettings(): void {
    this.display.toggleFocus(Scope.CANDLESTICK_DELTA_SETTINGS);
  }

  /**
   * Remembers a reference line as the active comparison target. Persists
   * across on/off toggles until the user picks a different one.
   * @param referenceId - Id of the reference series (from getReferences)
   */
  public setSelectedReference(referenceId: string): void {
    this.selectedReferenceId = referenceId;
  }

  /**
   * Builds and activates the virtual delta layer for the remembered (or
   * given) reference line, comparing every OHLC field. Replaces an
   * already-active delta layer in place when the user reconfigures via the
   * reference picker.
   *
   * @param referenceId - Reference series id; defaults to the remembered one
   * @returns True when the layer was activated
   */
  public activate(referenceId: string | null = this.selectedReferenceId): boolean {
    if (referenceId === null) {
      return false;
    }

    const candlestick = this.resolveCandlestick();
    if (!candlestick) {
      this.notification.notify(
        'Reference comparison is only available on candlestick charts.',
      );
      return false;
    }

    const reference = this.resolveReference(referenceId);
    if (!reference) {
      this.notification.notify('The selected reference line is unavailable.');
      return false;
    }

    const candles = this.buildDeltaCandles(candlestick, reference.points);
    if (candles.length === 0) {
      this.notification.notify(
        `No matching x values between the candlestick chart and ${reference.label}.`,
      );
      return false;
    }

    const wasActive = this.isActive;
    // Preserve the field being compared across an in-place reconfiguration.
    const initialField: CandlestickDeltaField
      = wasActive && this.deltaTrace ? this.deltaTrace.comparedField : 'close';

    const trace = this.buildTrace(
      candlestick,
      reference.label,
      candles,
      initialField,
    );

    // Land on the x the user is currently on: the delta layer's own position
    // when reconfiguring, otherwise the candle the user was on. This keeps the
    // candle position fixed as the virtual layer is toggled on and off.
    const currentX = wasActive && this.deltaTrace
      ? this.deltaTrace.getCurrentXValue()
      : candlestick.getCurrentXValue();
    const startIndex = currentX === null
      ? -1
      : candles.findIndex(candle => candle.x === currentX);
    if (startIndex >= 0) {
      trace.setInitialPosition(startIndex);
    }
    const previous = this.context.swapActiveTrace(trace);
    if (!previous) {
      trace.dispose();
      this.notification.notify('Reference comparison could not be activated here.');
      return false;
    }

    if (wasActive && this.deltaTrace && previous === this.deltaTrace) {
      // Reconfiguration: the old virtual layer is replaced; the anchor stays.
      this.deltaTrace.dispose();
    } else {
      this.anchor = previous;
    }
    this.deltaTrace = trace;
    this.selectedReferenceId = referenceId;

    this.rotor.resetToDataMode();
    if (!wasActive) {
      this.display.toggleFocus(Scope.CANDLESTICK_DELTA);
    }

    // State first, notification second: TextViewModel clears the alert
    // message on every navigation update, so announcing before the state
    // update would wipe these instructions before screen readers read them.
    trace.notifyStateUpdate();
    this.notification.notify(
      `Reference comparison on: OHLC price minus ${reference.label}, `
      + `${candles.length} points, starting on ${initialField}. `
      + 'Positive values are above the line, negative below. '
      + 'Use Left and Right arrows to move between candles, Up and Down to '
      + 'switch between open, high, low and close. Press Alt L to turn the '
      + 'comparison off, G for extrema, and the rotor to browse above-line, '
      + 'below-line, or on-line points. Press Escape to return to the chart.',
    );
    return true;
  }

  /**
   * Deactivates the virtual delta layer and restores the real chart layer.
   * The remembered reference is kept so a later Alt+L can re-enable it.
   *
   * @param options - Deactivation options
   * @param options.silent - Skip announcements and position sync (used when
   *   another navigation action is about to announce anyway)
   * @returns True when an active layer was deactivated
   */
  public deactivate(options: { silent?: boolean } = {}): boolean {
    const trace = this.deltaTrace;
    if (!trace) {
      return false;
    }

    const active = this.context.active === trace;
    let lastX: XValue | null = null;
    if (active) {
      lastX = trace.getCurrentXValue();
      if (this.anchor) {
        this.context.swapActiveTrace(this.anchor);
      }
    }

    const anchor = this.anchor;
    this.deltaTrace = null;
    this.anchor = null;
    trace.dispose();
    this.rotor.resetToDataMode();

    if (!active) {
      return false;
    }

    // Remove the delta scope from the focus stack (wherever it sits — the
    // user may be in braille or another nested mode) and re-assert the scope
    // now on top.
    this.display.toggleFocus(Scope.CANDLESTICK_DELTA);

    if (!options.silent) {
      // Sync the chart to the delta layer's x position first (plays the
      // regular tone + description), then announce the closure —
      // TextViewModel clears the alert message on every navigation update,
      // so the reverse order would wipe the announcement.
      if (anchor && lastX !== null) {
        anchor.moveToXValue(lastX);
      }
      this.notification.notify(
        'Reference comparison closed. Returned to the chart layer. '
        + 'Press Alt L to compare again.',
      );
    }
    return true;
  }

  /**
   * Deactivates without announcements if the delta layer is active. Used by
   * layer-switching commands so PageUp/PageDown from a nested mode cannot
   * strand the virtual trace on the navigation stack.
   */
  public deactivateIfActive(): void {
    if (this.isActive) {
      this.deactivate({ silent: true });
    } else if (this.deltaTrace) {
      // Stale virtual trace (e.g. the stack was rebuilt around it): drop it.
      this.deltaTrace.dispose();
      this.deltaTrace = null;
      this.anchor = null;
    }
  }

  /**
   * Discards the virtual layer's internal state and resets the rotor WITHOUT
   * touching the plot context stack or display focus. Used by callers that
   * manage the navigation stack and keyboard scope themselves while tearing
   * the delta layer down — e.g. the braille-Escape command on a multi-panel
   * figure, which pops the delta trace via `exitSubplot()` and re-focuses the
   * plot on its own. Using {@link deactivate} there would double-manage the
   * stack and fire a competing focus change.
   */
  public discardActiveLayer(): void {
    if (!this.deltaTrace) {
      return;
    }
    const trace = this.deltaTrace;
    this.deltaTrace = null;
    this.anchor = null;
    trace.dispose();
    this.rotor.resetToDataMode();
  }

  /**
   * Finds the candlestick trace the comparison anchors to: the active trace,
   * or the stored anchor when the delta layer itself is active.
   */
  private resolveCandlestick(): Candlestick | null {
    const active = this.context.active;
    if (active instanceof Candlestick) {
      return active;
    }
    if (
      this.deltaTrace !== null
      && active === this.deltaTrace
      && this.anchor instanceof Candlestick
    ) {
      return this.anchor;
    }
    return null;
  }

  private resolveReference(
    referenceId: string,
  ): { label: string; points: readonly LinePoint[] } | null {
    for (const trace of this.context.getActiveSubplotTraces()) {
      if (!(trace instanceof LineTrace)) {
        continue;
      }
      const series = trace.getSeries();
      for (let index = 0; index < series.length; index++) {
        if (`${trace.getId()}:${index}` === referenceId) {
          return series[index];
        }
      }
    }
    return null;
  }

  /**
   * Matches candles to reference points by x value, capturing every OHLC
   * value alongside the reference so the delta layer can recompute deltas as
   * the user navigates open/high/low/close. Candles without a reference value
   * at the same x (e.g. the head of a moving average window) or with any
   * non-finite OHLC value are skipped.
   */
  private buildDeltaCandles(
    candlestick: Candlestick,
    referencePoints: readonly LinePoint[],
  ): CandlestickDeltaCandle[] {
    const referenceByX = new Map<string, number>();
    for (const point of referencePoints) {
      const y = Number(point.y);
      if (Number.isFinite(y)) {
        referenceByX.set(String(point.x), y);
      }
    }

    const candles: CandlestickDeltaCandle[] = [];
    for (const candle of candlestick.getCandles()) {
      const reference = referenceByX.get(String(candle.value));
      if (reference === undefined) {
        continue;
      }
      if (
        !Number.isFinite(candle.open)
        || !Number.isFinite(candle.high)
        || !Number.isFinite(candle.low)
        || !Number.isFinite(candle.close)
      ) {
        continue;
      }
      candles.push({
        x: candle.value,
        reference,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    }
    return candles;
  }

  private buildTrace(
    candlestick: Candlestick,
    referenceLabel: string,
    candles: CandlestickDeltaCandle[],
    initialField: CandlestickDeltaField,
  ): CandlestickDeltaTrace {
    const candleState = candlestick.state;
    const xAxis = candleState.empty ? 'X' : candleState.xAxis;
    const yAxis = candleState.empty ? 'Y' : candleState.yAxis;

    const layer: MaidrLayer = {
      // Reuse the candlestick layer id so per-layer value formatters (dates,
      // currency) apply to the delta layer's x values and magnitudes too.
      id: candlestick.getId(),
      type: TraceType.CANDLESTICK_DELTA,
      title: `OHLC price vs ${referenceLabel}`,
      axes: {
        x: { label: xAxis },
        y: { label: `${yAxis} delta` },
      },
      data: [],
    };

    const trace = new CandlestickDeltaTrace(layer, {
      candles,
      referenceLabel,
      initialField,
    });
    this.wireTrace?.(trace);
    return trace;
  }
}
