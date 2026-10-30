import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';

import type {
  FigureState,
  HighlightState,
  PanelHighlightState,
  SubplotState,
  TraceState,
} from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';

/**
 * Union type representing all possible state types that the HighlightService can observe.
 * Includes subplot, trace, figure states, and settings changes.
 */
type HighlightStateUnion = SubplotState | TraceState | FigureState | Settings;

/**
 * Service responsible for managing visual highlighting of SVG elements in MAIDR visualizations.
 *
 * The HighlightService provides visual feedback by creating highlight overlays on chart elements
 * when users navigate through data points. It supports both trace-level highlighting (individual
 * data points) and subplot-level highlighting (for multi-plot scenarios).
 *
 * @implements {Observer<HighlightStateUnion>} - Observes state changes to update highlights
 * @implements {Disposable} - Supports cleanup when the service is no longer needed
 *
 * @example
 * ```typescript
 * const highlightService = new HighlightService(settingsService, () => [plot]);
 *
 * // Subscribe to state changes
 * traceState.subscribe(highlightService);
 *
 * // Manual highlighting
 * highlightService.highlight(svgElement);
 *
 * // Cleanup
 * highlightService.dispose();
 * ```
 */
export class HighlightService
implements Observer<HighlightStateUnion>, Disposable {
  /**
   * Map storing the relationship between original SVG elements and their highlight clones.
   * Keys are the original elements, values are the highlight overlay element
   * first, then the copies of the labels drawn over it, removed together.
   */
  private readonly highlightedElements: Map<SVGElement, SVGElement[]>;
  private readonly settingsService: SettingsService;

  /**
   * The elements the chart is drawn in, the same ones its layout is resolved
   * in. Its figure background is read inside them alone: another chart on the
   * page has a background of its own.
   */
  private readonly chartRoots: () => readonly Element[];

  /**
   * Set of subplot panels that are currently outlined.
   * Used to track and clean up subplot-level highlights.
   */
  private readonly highlightedSubplots: Set<Element>;

  /**
   * The current color used for highlighting elements.
   * Updated when settings change.
   */
  private currentHighlightColor: string;

  /**
   * Whether high contrast is on, in which case the highlight colour is drawn
   * as it is rather than derived from the mark. Updated when settings change.
   */
  private highContrastMode: boolean;

  /**
   * The colours a label drawn over a highlight may be given to read on it:
   * the reader's high contrast pair while high contrast is on, black and
   * white otherwise. Updated when settings change.
   */
  private labelColors: readonly string[];

  /**
   * Disposable for the settings change subscription, released on dispose().
   */
  private settingsDisposable: Disposable | null = null;

  /**
   * Watches the outlined panels and the chart for a change of size, so that a
   * box drawn round a panel is drawn again where the panel now is. A box is
   * placed from where its panel is when it is drawn, so a chart laid out
   * again at another size -- a responsive chart in a resized window, or a
   * page zoomed -- left the box where the panel had been until the reader's
   * next move in the lobby, and for as long as they stayed in the panel.
   * Null where the browser has no `ResizeObserver`.
   */
  private readonly panelResizes: ResizeObserver | null;

  /**
   * Creates a new HighlightService instance.
   *
   * @param settings - The settings service used to retrieve highlight color preferences
   * @param chartRoots - The elements the chart is drawn in, its own first
   */
  public constructor(settings: SettingsService, chartRoots: () => readonly Element[]) {
    this.settingsService = settings;
    this.chartRoots = chartRoots;

    this.highlightedElements = new Map();
    this.highlightedSubplots = new Set();
    this.panelResizes = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.redrawPanelOutlines());
    const initialSettings = settings.loadSettings();
    this.currentHighlightColor = initialSettings.general.highlightColor;
    this.highContrastMode = initialSettings.general.highContrastMode;
    this.labelColors = HighlightService.labelColorsOf(initialSettings);

    // Subscribe to settings changes via the emitter (the same pattern used by
    // audio/autoplay/braille/highContrast). This service is not registered on
    // the SettingsService observer list, so the emitter is the live channel for
    // picking up a new highlight color mid-session.
    this.settingsDisposable = settings.onChange((event) => {
      this.handleSettingsUpdate(event.newSettings);
    });
  }

  /**
   * Disposes of the service by removing all active highlights.
   * Should be called when the service is no longer needed to prevent memory leaks.
   */
  public dispose(): void {
    this.settingsDisposable?.dispose();
    this.settingsDisposable = null;
    this.unhighlightAll();
  }

  /**
   * Type guard to determine if a state object is a Settings type.
   *
   * @param state - The state object to check
   * @returns True if the state is a Settings object, false otherwise
   */
  private isSettings(state: HighlightStateUnion): state is Settings {
    return 'general' in state;
  }

  /**
   * The colours a label over a highlight may take under the given settings.
   *
   * @param settings - The settings
   * @returns The reader's high contrast pair while high contrast is on, black
   *   and white otherwise
   */
  private static labelColorsOf(settings: Settings): readonly string[] {
    const { general } = settings;
    return general.highContrastMode
      ? [general.highContrastLightColor, general.highContrastDarkColor]
      : ['#000000', '#ffffff'];
  }

  /**
   * Creates a highlight overlay element for the given SVG element, and copies
   * of the labels drawn over it in a colour that reads on it (see
   * `Svg.createLabelHighlights`).
   *
   * @param element - The SVG element to create a highlight for
   * @returns The highlight overlay, then the label copies
   * @throws {TypeError} If the provided element is not an SVGElement
   */
  private createHighlightElement(element: SVGElement): SVGElement[] {
    if (!(element instanceof SVGElement)) {
      throw new TypeError('Invalid element provided for highlight creation');
    }

    // In high contrast a mark is painted from the reader's palette, so a
    // colour derived from it is a darker copy of their light colour: on the
    // dark page, the dimmest label there rather than the one they are on.
    const clone = Svg.createHighlightElement(
      element,
      this.currentHighlightColor,
      { useColorAsIs: this.highContrastMode },
    );
    clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
    return [clone, ...Svg.createLabelHighlights(element, clone, this.labelColors)];
  }

  /**
   * Handles updates to application settings by updating the highlight color
   * and whether high contrast is on.
   *
   * @param settings - The updated settings object containing the new highlight color
   */
  private handleSettingsUpdate(settings: Settings): void {
    const colorChanged = settings.general.highlightColor !== this.currentHighlightColor;
    this.currentHighlightColor = settings.general.highlightColor;
    this.highContrastMode = settings.general.highContrastMode;
    this.labelColors = HighlightService.labelColorsOf(settings);
    if (colorChanged) {
      this.redraw();
    }
  }

  /**
   * Draws the current highlight again, as the next move would: from the
   * marks as they are painted now, in the highlight colour as it is set now.
   *
   * A highlight is a copy of its mark, taken when it is drawn. Once high
   * contrast repaints the chart, or the highlight colour changes, the copy
   * keeps the old palette until the reader moves: a Graphviz node's copy
   * covered its new light outline with the old black one, and a black tile
   * stayed on a chart put back to light. Settings are read afresh, since
   * the change that called this may not have reached this service yet.
   */
  public redraw(): void {
    const settings = this.settingsService.loadSettings();
    this.currentHighlightColor = settings.general.highlightColor;
    this.highContrastMode = settings.general.highContrastMode;
    this.labelColors = HighlightService.labelColorsOf(settings);

    for (const [original, highlights] of [...this.highlightedElements]) {
      // A live update may have replaced the mark without telling this
      // service, and kept the reader's place: the copy stays, in the palette
      // it was drawn in, until the next move draws the new mark. Dropped,
      // it left that place unmarked.
      if (!original.isConnected) {
        continue;
      }
      // Removed first, so the new copy lands where the old one was.
      highlights.forEach(highlight => highlight.remove());
      this.highlightedElements.delete(original);
      try {
        this.highlightedElements.set(original, this.createHighlightElement(original));
      } catch (error) {
        console.error('[HighlightService] Failed to redraw highlight:', error);
      }
    }

    this.redrawPanelOutlines();
  }

  /**
   * Outlines each outlined panel again, where it is now, in the highlight
   * colour as it is set now. A panel no longer on the page keeps its outline
   * until the next move, as a copy of a mark does in {@link redraw}.
   */
  private redrawPanelOutlines(): void {
    const figureBackground = this.figureBackground();
    for (const element of this.highlightedSubplots) {
      if (element.isConnected) {
        Svg.outlinePanel(element, this.currentHighlightColor, figureBackground);
      }
    }
  }

  /**
   * Handles state updates for figure, subplot, or trace states.
   * Determines the appropriate highlighting strategy based on state type.
   *
   * @param state - The state object containing highlight information
   */
  private handleStateUpdate(
    state: SubplotState | TraceState | FigureState,
  ): void {
    if (state.empty) {
      return;
    }

    this.unhighlightTraceElements();

    if (state.type === 'figure') {
      this.handleFigureState(state);
    } else if (state.type === 'subplot') {
      this.handleSubplotState(state);
    } else {
      this.handleTraceState(state);
    }
  }

  /**
   * Handles highlighting for figure-level state changes.
   *
   * @param state - The figure state containing highlight information
   */
  private handleFigureState(state: FigureState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  /**
   * Handles highlighting for subplot-level state changes.
   *
   * @param state - The subplot state containing highlight information
   */
  private handleSubplotState(state: SubplotState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  /**
   * Handles highlighting for trace-level state changes.
   * Extracts elements from the highlight state and applies trace highlighting.
   *
   * @param state - The trace state containing highlight information
   */
  private handleTraceState(state: TraceState): void {
    if (state.empty || state.highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(state.highlight);
    this.highlightTraceElements(elements);
  }

  /**
   * Outlines the panel a figure or subplot state names, or clears the outline
   * when it names none.
   *
   * The model names a panel only on a figure of several subplots, for every
   * producer it can find one for. Outlining only where the chart had more
   * than one matplotlib axes group, as this did, left the lobby of every
   * other producer's figure with nothing on screen to say which panel the
   * reader was on.
   *
   * @param highlight - The panel to outline
   */
  private processHighlighting(highlight: PanelHighlightState): void {
    if (highlight.empty) {
      this.unhighlightSubplotElements();
      return;
    }
    this.highlightSubplotElements([highlight.elements]);
  }

  /**
   * Extracts SVG elements from a highlight state object.
   * Normalizes the elements to always return an array.
   *
   * @param highlight - The highlight state containing element(s)
   * @returns An array of SVG elements to highlight
   */
  private getElementsFromHighlight(highlight: HighlightState): SVGElement[] {
    if (highlight.empty) {
      return [];
    }
    return Array.isArray(highlight.elements)
      ? highlight.elements
      : [highlight.elements];
  }

  /**
   * Applies highlight overlays to trace-level SVG elements.
   * Creates cloned highlight elements and tracks them in the highlightedElements map.
   *
   * @param elements - Array of SVG elements to highlight
   */
  private highlightTraceElements(elements: SVGElement[]): void {
    for (const element of elements) {
      try {
        const highlights = this.createHighlightElement(element);
        this.highlightedElements.set(element, highlights);
      } catch (error) {
        console.error('Failed to highlight element:', error);
      }
    }
  }

  /**
   * Outlines subplot panels.
   * Uses adaptive color calculation based on the figure background.
   *
   * The background is py-maidr's figure patch, whose group py-maidr gives a
   * `maidr-<uuid>` id; a chart without one is measured against the highlight
   * colour itself.
   *
   * @param elements - The panels to outline
   */
  private highlightSubplotElements(elements: Element[]): void {
    this.unhighlightSubplotElements();
    const figureBgElement = this.figureBackground();
    for (const element of elements) {
      Svg.outlinePanel(
        element,
        this.currentHighlightColor,
        figureBgElement,
      );
      this.highlightedSubplots.add(element);
      this.panelResizes?.observe(element);
    }
    this.chartRoots().forEach(root => this.panelResizes?.observe(root));
  }

  /**
   * The figure's background, py-maidr's figure patch, which a panel's outline
   * is measured against; `undefined` for a chart without one.
   */
  private figureBackground(): SVGElement | undefined {
    const figure = this.chartRoots()
      .map(root => root.querySelector('g[id^="maidr-"] > path[style*="fill"]'))
      .find(path => path !== null)
      ?.parentElement as SVGElement | null;
    return (figure?.querySelector('path[style*="fill"]') as SVGElement) || undefined;
  }

  /**
   * Observer update method called when observed state changes.
   * Routes to appropriate handler based on state type.
   *
   * @param state - The updated state object (Settings, SubplotState, TraceState, or FigureState)
   */
  public update(state: HighlightStateUnion): void {
    try {
      if (this.isSettings(state)) {
        this.handleSettingsUpdate(state);
      } else {
        this.handleStateUpdate(state);
      }
    } catch (error) {
      console.error('Failed to update highlight service:', error);
    }
  }

  /**
   * Manually highlights a single SVG element.
   * Removes any existing highlight on the element before applying a new one.
   *
   * @param element - The SVG element to highlight
   */
  public highlight(element: SVGElement): void {
    if (!(element instanceof SVGElement)) {
      console.warn('Invalid element provided to highlight method');
      return;
    }

    try {
      this.unhighlight(element);
      const highlights = this.createHighlightElement(element);
      this.highlightedElements.set(element, highlights);
    } catch (error) {
      console.error('Failed to highlight element:', error);
    }
  }

  /**
   * Removes the highlight from a single SVG element.
   * Safely handles cases where the element has no active highlight.
   *
   * @param element - The SVG element to remove highlight from
   */
  public unhighlight(element: SVGElement): void {
    if (!(element instanceof SVGElement)) {
      return;
    }

    const highlights = this.highlightedElements.get(element);
    if (highlights) {
      try {
        highlights.forEach(highlight => highlight.remove());
        this.highlightedElements.delete(element);
      } catch (error) {
        console.error('Failed to unhighlight element:', error);
      }
    }
  }

  /**
   * Clears all active highlights from both trace elements and subplots.
   * Use this method to reset the visual state of the visualization.
   */
  public clear(): void {
    try {
      this.highlightedElements.forEach((highlights) => {
        highlights.forEach(highlight => highlight.remove());
      });
      this.highlightedElements.clear();
      this.unhighlightSubplotElements();
    } catch (error) {
      console.error('Failed to clear highlights:', error);
    }
  }

  /**
   * Removes all trace-level highlights from the DOM and clears the tracking map.
   */
  private unhighlightTraceElements(): void {
    this.highlightedElements.forEach((highlights) => {
      highlights.forEach(highlight => highlight.remove());
    });
    this.highlightedElements.clear();
  }

  /**
   * Removes all subplot-level highlight styling and clears the tracking set.
   */
  private unhighlightSubplotElements(): void {
    this.panelResizes?.disconnect();
    this.highlightedSubplots.forEach((element) => {
      Svg.removePanelOutline(element);
    });
    this.highlightedSubplots.clear();
  }

  /**
   * Removes all highlights from both trace elements and subplots.
   * Called internally during disposal and cleanup operations.
   */
  private unhighlightAll(): void {
    this.unhighlightTraceElements();
    this.unhighlightSubplotElements();
  }
}
