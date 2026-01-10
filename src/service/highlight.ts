import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';

import type {
  FigureState,
  HighlightState,
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
 * const highlightService = new HighlightService(settingsService);
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
   * Keys are the original elements, values are the highlight overlay elements.
   */
  private readonly highlightedElements: Map<SVGElement, SVGElement>;
  private readonly settingsService: SettingsService;

  /**
   * Set of subplot elements that currently have highlight styling applied.
   * Used to track and clean up subplot-level highlights.
   */
  private readonly highlightedSubplots: Set<SVGElement>;

  /**
   * The current color used for highlighting elements.
   * Updated when settings change.
   */
  private currentHighlightColor: string;

  /**
   * Creates a new HighlightService instance.
   *
   * @param settings - The settings service used to retrieve highlight color preferences
   */
  public constructor(settings: SettingsService) {
    this.settingsService = settings;

    this.highlightedElements = new Map();
    this.highlightedSubplots = new Set();
    const initialSettings = settings.loadSettings();
    this.currentHighlightColor = initialSettings.general.highlightColor;
  }

  /**
   * Disposes of the service by removing all active highlights.
   * Should be called when the service is no longer needed to prevent memory leaks.
   */
  public dispose(): void {
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
   * Creates a highlight overlay element for the given SVG element.
   *
   * @param element - The SVG element to create a highlight for
   * @returns A new SVG element configured as a highlight overlay
   * @throws {TypeError} If the provided element is not an SVGElement
   */
  private createHighlightElement(element: SVGElement): SVGElement {
    if (!(element instanceof SVGElement)) {
      throw new TypeError('Invalid element provided for highlight creation');
    }

    const clone = Svg.createHighlightElement(
      element,
      this.currentHighlightColor,
    );
    clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
    return clone;
  }

  /**
   * Handles updates to application settings by updating the highlight color.
   *
   * @param settings - The updated settings object containing the new highlight color
   */
  private handleSettingsUpdate(settings: Settings): void {
    this.currentHighlightColor = settings.general.highlightColor;
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
   * Processes highlighting based on whether the visualization is a multi-plot scenario.
   * For multi-plot scenarios, applies subplot highlighting; otherwise clears subplot highlights.
   *
   * @param highlight - The highlight state containing elements to highlight
   */
  private processHighlighting(highlight: HighlightState): void {
    if (highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(highlight);
    const isMultiPlot = this.isMultiPlotScenario();

    if (isMultiPlot) {
      this.highlightSubplotElements(elements);
    } else {
      this.unhighlightSubplotElements();
    }
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
   * Determines if the current visualization contains multiple subplots.
   * Checks the DOM for multiple axes groups to identify multi-plot scenarios.
   *
   * @returns True if more than one subplot exists, false otherwise
   */
  private isMultiPlotScenario(): boolean {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;
    return totalSubplots > 1;
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
        const highlightElement = this.createHighlightElement(element);
        this.highlightedElements.set(element, highlightElement);
      } catch (error) {
        console.error('Failed to highlight element:', error);
      }
    }
  }

  /**
   * Applies highlight styling to subplot-level SVG elements.
   * Uses adaptive color calculation based on the figure background.
   *
   * @param elements - Array of subplot SVG elements to highlight
   */
  private highlightSubplotElements(elements: SVGElement[]): void {
    this.unhighlightSubplotElements();
    const figure = document.querySelector(
      'g[id^="maidr-"] > path[style*="fill"]',
    )?.parentElement as SVGElement | null;
    const figureBgElement
      = (figure?.querySelector('path[style*="fill"]') as SVGElement) || undefined;
    for (const element of elements) {
      Svg.setSubplotHighlightSvgWithAdaptiveColor(
        element,
        this.currentHighlightColor,
        figureBgElement,
      );
      this.highlightedSubplots.add(element);
    }
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
      const highlightElement = this.createHighlightElement(element);
      this.highlightedElements.set(element, highlightElement);
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

    const highlightElement = this.highlightedElements.get(element);
    if (highlightElement) {
      try {
        highlightElement.remove();
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
      this.highlightedElements.forEach((highlightElement) => {
        highlightElement.remove();
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
    this.highlightedElements.forEach((highlightElement) => {
      highlightElement.remove();
    });
    this.highlightedElements.clear();
  }

  /**
   * Removes all subplot-level highlight styling and clears the tracking set.
   */
  private unhighlightSubplotElements(): void {
    this.highlightedSubplots.forEach((element) => {
      Svg.removeSubplotHighlightSvg(element);
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
