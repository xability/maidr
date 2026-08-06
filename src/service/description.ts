import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { DescriptionStat, DescriptionState, DisplayDescriptionState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';
import { defaultFormat } from '@util/format';

/**
 * Rounds one cell or summary value for display.
 *
 * A cell holding several values — a box plot's outliers — is rounded value by
 * value and joined, which is why traces hand those over as an array rather than
 * a string they joined themselves.
 *
 * A non-finite number is left as the number it is. `defaultFormat` would turn
 * it into the literal text `"NaN"`, and the dialog's own `isDisplayable` check
 * blanks a non-finite *number* but would happily print that *string*.
 *
 * @param value - The value as the trace reported it.
 * @returns The value rounded for display, or unchanged if it is not a number.
 */
function roundCell(value: string | number | number[]): string | number {
  if (Array.isArray(value)) {
    return value.map(roundCell).join(', ');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return value;
  }
  return defaultFormat(value);
}

/**
 * Service for managing the chart description modal.
 * Retrieves objective description data from the active trace on demand.
 */
export class DescriptionService {
  private readonly context: Context;
  private readonly display: DisplayService;

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
      return {
        ...description,
        ...this.rounded(description),
        title,
        ...(subplots.length > 0 && { subplots }),
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
    const state = active.state;
    if (state.type === 'figure' && !state.empty) {
      return this.getFigureDescription(state.size);
    }

    return null;
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
   * Only the announcement is shortened. Sonification, braille, and extrema all
   * read the trace's own numbers and never pass through here.
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
   * Surfaces the authored figure title, subplot count, any authored
   * subtitle/caption, and the authored figure-wide axes (e.g. a facet grid's
   * shared X/Y labels), plus the per-subplot summaries so the user sees what
   * is available before navigating in. The data table is left blank (no rows)
   * because raw data is a trace-level concept with no figure-level equivalent;
   * the description modal hides empty sections.
   *
   * @param size - The number of subplots in the figure.
   * @returns The figure-level description state.
   */
  private getFigureDescription(size: number): DisplayDescriptionState {
    const figureTitle = this.context.figureTitle;
    const title = this.context.isAuthoredTitle(figureTitle) ? figureTitle : '';

    const stats: DescriptionStat[] = [
      { label: 'Subplots', value: size },
    ];
    const subtitle = this.context.figureSubtitle;
    if (this.context.isAuthoredSubtitle(subtitle)) {
      stats.push({ label: 'Subtitle', value: subtitle });
    }
    const caption = this.context.figureCaption;
    if (this.context.isAuthoredCaption(caption)) {
      stats.push({ label: 'Caption', value: caption });
    }

    // Mirror the trace-level branch: only surface `subplots` when there is at
    // least one summary, matching the DescriptionState contract that the field
    // is present only for genuine multi-panel figures.
    const subplots = this.context.getSubplotSummaries();
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
   * Toggles the visibility of the description modal.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.DESCRIPTION);
  }
}
