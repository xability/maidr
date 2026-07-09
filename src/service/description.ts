import type { Context } from '@model/context';
import type { DisplayService } from '@service/display';
import type { DescriptionStat, DescriptionState } from '@type/state';
import { AbstractTrace } from '@model/abstract';
import { Scope } from '@type/event';

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
  public getDescription(): DescriptionState | null {
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
   * Builds a figure-level description for a multi-panel figure's lobby view.
   * Surfaces the authored figure title, subplot count, and any authored
   * subtitle/caption, plus the per-subplot summaries so the user sees what
   * is available before navigating in. Axes and the data table are left
   * blank (empty object / no rows) because those are trace-level concepts
   * with no figure-level equivalent; the description modal hides those
   * empty sections.
   *
   * @param size - The number of subplots in the figure.
   * @returns The figure-level description state.
   */
  private getFigureDescription(size: number): DescriptionState {
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
      axes: {},
      stats,
      dataTable: { headers: [], rows: [] },
      ...(subplots.length > 0 && { subplots }),
    };
  }

  /**
   * Toggles the visibility of the description modal.
   */
  public toggle(): void {
    this.display.toggleFocus(Scope.DESCRIPTION);
  }
}
