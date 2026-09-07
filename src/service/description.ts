import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { Disposable } from '@type/disposable';
import type { DescriptionStat, DescriptionState, DisplayDescriptionState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';
import { defaultFormat } from '@util/format';

/**
 * Rounds one cell or summary value for display.
 *
 * A non-finite number comes back as the number it is, so the dialog's own
 * `isDisplayable` check can blank the cell. Handing back `defaultFormat`'s
 * output instead would give it the literal text `"NaN"`, which that check
 * blanks as a *number* but would happily print as a *string*.
 *
 * A cell holding several values — a box plot's outliers — is rounded value by
 * value and joined, which is why traces hand those over as an array rather than
 * a string they joined themselves. A non-finite entry is dropped instead of
 * blanked: `join` would coerce it back into that same `"NaN"` text, and a
 * joined cell has no way to hand a blank back for one entry of it.
 *
 * A string is already display text and `defaultFormat` returns it untouched.
 *
 * @param value - The value as the trace reported it.
 * @returns The rounded value, a number when it is non-finite, or the joined
 * and rounded entries when the cell holds several values.
 */
function roundCell(value: string | number | number[]): string | number {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '';
    }
    // Named rather than dropped. Filtering the non-finite entries out made the
    // cell claim one outlier where the trace reported two, with nothing to say
    // the other had been removed. `missing` is the word the announcements
    // already use for a value that is not there, so the two agree.
    return value.map(entry => roundNonFinite(entry) ?? defaultFormat(entry)).join(', ');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    // An infinity is a bound the chart really has, so it is named. A NaN is
    // handed back as a *number* so the dialog's own `isDisplayable` blanks the
    // cell -- naming it here would put the word in every empty cell of a
    // sparse table, where the blank is what a reader expects and the row's
    // own stat already says how many values are absent.
    return Number.isNaN(value) ? value : (roundNonFinite(value) ?? value);
  }
  return defaultFormat(value);
}

/**
 * How a non-finite number reads, or null when it is finite and the caller
 * should format it normally.
 *
 * @param value - The number to name.
 * @returns The word for it, or null.
 */
function roundNonFinite(value: number): string | null {
  if (Number.isFinite(value)) {
    return null;
  }
  if (value === Number.POSITIVE_INFINITY) {
    return 'infinity';
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return 'negative infinity';
  }
  return 'missing';
}

/**
 * Service for managing the chart description modal.
 * Retrieves objective description data from the active trace on demand.
 */
export class DescriptionService implements Disposable {
  private readonly context: Context;
  private readonly display: DisplayService;

  /**
   * Whether a layer tab moved the model's active layer during this visit to
   * the dialog, and the reader has therefore not yet been told about it. See
   * {@link selectLayer}.
   */
  private hasPendingLayerSwitch = false;

  public constructor(context: Context, display: DisplayService) {
    this.context = context;
    this.display = display;
  }

  /**
   * Gets the description state from the currently active trace.
   * @returns The description state or null if no active trace
   */
  public getDescription(): DisplayDescriptionState | null {
    const active = this.context.active;
    if (active instanceof AbstractTrace) {
      const description = active.description;
      // Resolve the best available title. Prefer the layer title if it was
      // explicitly set, then fall back to the figure title if explicit,
      // otherwise clear it.
      const layerTitle = description.title;
      const figureTitle = this.context.figureTitle;
      const hasLayerTitle = this.context.isAuthoredTitle(layerTitle);
      const hasFigureTitle = this.context.isAuthoredTitle(figureTitle);
      const title = hasLayerTitle ? layerTitle : hasFigureTitle ? figureTitle : '';

      const subplots = this.context.getSubplotSummaries();
      const layers = this.context.getLayerSummaries();
      const rounded = this.rounded(description);
      // Orientation first, and the figure's own notes last: which way the
      // chart is drawn qualifies everything under it -- for the box, violin
      // and boxen families it reverses the order of the table's rows -- while
      // a subtitle and a caption belong to the figure rather than to this
      // layer, and used to be visible only from the multi-panel lobby, which a
      // single-panel figure never has.
      const orientation = active.orientationLabel;
      return {
        ...description,
        ...rounded,
        stats: [
          ...(orientation ? [{ label: 'Orientation', value: orientation }] : []),
          ...rounded.stats,
          ...this.figureNotes(),
        ],
        title,
        ...(subplots.length > 0 && { subplots }),
        ...(layers.length > 0 && { layers }),
      };
    }

    // Multi-panel lobby: the active element is the Figure itself (the user has
    // not entered a subplot yet), so there is no trace to introspect.
    // Summarize the whole figure instead so 'd' works at the figure level.
    //
    // Only 'figure' is handled here, not 'subplot': the Context stack pushes a
    // bare Figure exactly when it is at figure level (Context.isFigureLevel),
    // and a Subplot is always paired with a Trace on top (see enterSubplot), so
    // a Subplot is never the active element on its own.
    //
    // The `!state.empty` check is required to narrow to the populated
    // FigureState variant (which carries `size`); `Figure.state` never returns
    // the empty variant in practice (that only comes from `outOfBoundsState`,
    // which is delivered straight to observers, not via this getter). The final
    // `return null` is therefore defensive against the declared PlotState type
    // rather than a reachable runtime path.
    // Asked of the cheap level accessor rather than of `active.state`, which
    // builds the focused subplot's whole announcement -- audio, braille, text
    // and highlight for its active trace -- to hand back one number.
    if (this.context.activeLevel === 'figure') {
      return this.getFigureDescription();
    }

    return null;
  }

  /**
   * The figure's own subtitle and caption, when it authored them.
   *
   * Shown at both levels of the dialog. They used to appear only in the
   * multi-panel lobby, so a single-panel figure -- which has no lobby, because
   * the context enters its one subplot immediately -- could carry a caption
   * that `d` never showed at all.
   *
   * @returns The authored notes, in reading order.
   */
  private figureNotes(): DescriptionStat[] {
    const notes: DescriptionStat[] = [];
    const subtitle = this.context.figureSubtitle;
    if (this.context.isAuthoredSubtitle(subtitle)) {
      notes.push({ label: 'Subtitle', value: subtitle });
    }
    const caption = this.context.figureCaption;
    if (this.context.isAuthoredCaption(caption)) {
      notes.push({ label: 'Caption', value: caption });
    }
    return notes;
  }

  /**
   * Rounds the numbers a trace put in its description down to what a screen
   * reader can reasonably speak.
   *
   * A trace reports the values it holds, and a computed one carries its full
   * float: the box plot examples describe a whisker at `21.957700280519678`,
   * which is seventeen digits to listen through for two digits of meaning. The
   * same `defaultFormat` the announcements already use (see #727) is applied
   * here, so the dialog and the spoken text agree on how a value reads.
   *
   * Only what the dialog shows is shortened, and only on the way out — the
   * trace keeps its own numbers. Sonification, braille, and extrema read those
   * directly and never pass through here.
   *
   * @param description - The description as the trace built it.
   * @returns The stats and data table with their numbers rounded.
   */
  private rounded(
    description: DescriptionState,
  ): Pick<DisplayDescriptionState, 'stats' | 'dataTable'> {
    return {
      stats: description.stats.map(stat => ({
        ...stat,
        value: roundCell(stat.value),
      })),
      dataTable: {
        headers: description.dataTable.headers,
        rows: description.dataTable.rows.map(row => row.map(roundCell)),
      },
    };
  }

  /**
   * Builds a figure-level description for a multi-panel figure's lobby view.
   * Surfaces the authored figure title, where the reader is standing, a census
   * of the chart types the panels hold, any authored subtitle/caption, and the
   * authored figure-wide axes (e.g. a facet grid's shared X/Y labels), plus the
   * per-subplot summaries so the user sees what is available before navigating
   * in. The data table is left blank (no rows) because raw data is a
   * trace-level concept with no figure-level equivalent; the description modal
   * hides empty sections.
   *
   * @returns The figure-level description state.
   */
  private getFigureDescription(): DisplayDescriptionState {
    const figureTitle = this.context.figureTitle;
    const title = this.context.isAuthoredTitle(figureTitle) ? figureTitle : '';

    // Mirror the trace-level branch: only surface `subplots` when there is at
    // least one summary, matching the DescriptionState contract that the field
    // is present only for genuine multi-panel figures.
    const subplots = this.context.getSubplotSummaries();
    const active = subplots.find(subplot => subplot.isActive);

    // Not "Subplots: 3": the list below is headed with that count already. What
    // a reader cannot get from the list is where they are standing in it, and
    // what kinds of chart it holds without walking every entry.
    const kinds = new Map<string, number>();
    subplots.forEach(subplot =>
      subplot.traceTypes.forEach(kind => kinds.set(kind, (kinds.get(kind) ?? 0) + 1)),
    );
    const stats: DescriptionStat[] = [
      ...(active
        ? [{ label: 'Currently on', value: `subplot ${active.index} of ${subplots.length}` }]
        : []),
      ...(kinds.size > 0
        ? [{
            label: 'Chart types',
            value: [...kinds].map(([kind, n]) => (n > 1 ? `${kind} (${n})` : kind)).join(', '),
          }]
        : []),
      ...this.figureNotes(),
    ];

    return {
      chartType: 'Multi-panel figure',
      title,
      axes: this.getFigureAxes(),
      stats,
      dataTable: { headers: [], rows: [] },
      ...(subplots.length > 0 && { subplots }),
    };
  }

  /**
   * Resolves the figure-wide axes to show in the lobby description: the
   * authored figure-level X/Y labels (a facet grid's shared axes). Returns an
   * empty object when no figure-wide axis was authored — per-subplot axes
   * belong to each subplot's own summary, so the figure overview omits them,
   * matching the prior behavior for figures without global axes.
   *
   * @returns The axes object for the figure-level description.
   */
  private getFigureAxes(): DescriptionState['axes'] {
    const x = this.context.figureXAxis;
    const y = this.context.figureYAxis;
    // Only x/y are figure-wide concepts; z (level/group/trend) is inherently
    // per-trace, so there is no figure-level z to surface here.
    return {
      ...(this.context.isAuthoredAxisLabel(x) && { x }),
      ...(this.context.isAuthoredAxisLabel(y) && { y }),
    };
  }

  /**
   * Switches the reader to another layer of the current subplot and hands back
   * that layer's description.
   *
   * The switch is real -- it moves the model's active trace, carrying the
   * reader's position across the way a PageUp step does -- so leaving the
   * dialog lands them on the layer they were last reading about rather than
   * the one they opened it from. It is also silent: the trace's own "Layer 2
   * of 3" announcement would talk over the dialog, so it is deferred to
   * {@link announcePendingLayerSwitch}, which the close path calls.
   *
   * @param index - Zero-based layer index within the active subplot
   * @returns The newly active layer's description, or null when the index
   *   named the active layer, was out of range, or there is nothing to
   *   describe once the switch has been made.
   */
  public selectLayer(index: number): DisplayDescriptionState | null {
    if (!this.context.selectTrace(index)) {
      return null;
    }
    this.hasPendingLayerSwitch = true;
    return this.getDescription();
  }

  /**
   * Speaks the layer a {@link selectLayer} call switched to, if any, and
   * forgets it.
   *
   * Called as the dialog closes, so the reader hears which layer they have
   * been returned to exactly once -- not once per tab they browsed through.
   * A no-op when no layer was selected, which is every ordinary open-and-close
   * of the dialog.
   */
  public announcePendingLayerSwitch(): void {
    if (!this.hasPendingLayerSwitch) {
      return;
    }
    this.hasPendingLayerSwitch = false;
    this.context.notifyActiveTrace();
  }

  /**
   * Toggles the visibility of the description modal.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.DESCRIPTION);
  }

  /**
   * Drops the deferred layer-switch announcement.
   *
   * {@link announcePendingLayerSwitch} is reached from exactly one place --
   * `DescriptionViewModel.toggle`'s close branch -- so any teardown that does
   * not go through it would leave the flag raised and have the *next* dialog
   * announce a switch that never happened.
   */
  public dispose(): void {
    this.hasPendingLayerSwitch = false;
  }
}
