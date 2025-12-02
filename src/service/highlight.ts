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
 * Union type representing all possible state types that can trigger highlight updates.
 */
type HighlightStateUnion = SubplotState | TraceState | FigureState | Settings;

/**
 * Service for managing visual highlighting of SVG elements in plots and subplots.
 */
export class HighlightService
implements Observer<HighlightStateUnion>, Disposable {
  private readonly highlightedElements: Map<SVGElement, SVGElement>;
  private readonly highlightedSubplots: Set<SVGElement>;
  private currentHighlightColor: string;

  /**
   * Creates a new HighlightService instance and initializes highlight color from settings.
   * @param settings - The settings service for retrieving highlight configuration
   */
  public constructor(settings: SettingsService) {
    this.highlightedElements = new Map();
    this.highlightedSubplots = new Set();
    const initialSettings = settings.loadSettings();
    this.currentHighlightColor = initialSettings.general.highlightColor;
  }

  /**
   * Cleans up all highlights when the service is disposed.
   */
  public dispose(): void {
    this.unhighlightAll();
  }

  /**
   * Type guard to check if the state is a Settings object.
   * @param state - The state union to check
   * @returns True if the state is Settings
   */
  private isSettings(state: HighlightStateUnion): state is Settings {
    return 'general' in state;
  }

  /**
   * Creates a highlight clone element for a given SVG element.
   * @param element - The SVG element to create a highlight for
   * @returns The created highlight SVG element
   * @throws TypeError if the element is not a valid SVGElement
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
   * Updates the current highlight color when settings change.
   * @param settings - The updated settings object
   */
  private handleSettingsUpdate(settings: Settings): void {
    this.currentHighlightColor = settings.general.highlightColor;
  }

  /**
   * Handles state updates for subplot, trace, or figure states.
   * @param state - The state object containing highlighting information
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
   * Processes highlighting for figure-level state changes.
   * @param state - The figure state containing highlight information
   */
  private handleFigureState(state: FigureState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  /**
   * Processes highlighting for subplot-level state changes.
   * @param state - The subplot state containing highlight information
   */
  private handleSubplotState(state: SubplotState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  /**
   * Processes highlighting for trace-level state changes.
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
   * Processes highlighting based on the highlight state and multi-plot scenario.
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
   * Extracts SVG elements from a highlight state.
   * @param highlight - The highlight state containing elements
   * @returns Array of SVG elements to highlight
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
   * Determines if the current visualization has multiple subplots.
   * @returns True if there are multiple subplots
   */
  private isMultiPlotScenario(): boolean {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;
    return totalSubplots > 1;
  }

  /**
   * Highlights trace elements by creating and attaching highlight overlays.
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
   * Highlights subplot elements with adaptive color based on figure background.
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
   * Updates highlights based on state or settings changes.
   * @param state - The state union containing highlight or settings information
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
   * Highlights a single SVG element by creating a highlight overlay.
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
   * Removes the highlight overlay from a single SVG element.
   * @param element - The SVG element to unhighlight
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
   * Clears all trace and subplot highlights.
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
   * Removes all trace element highlights.
   */
  private unhighlightTraceElements(): void {
    this.highlightedElements.forEach((highlightElement) => {
      highlightElement.remove();
    });
    this.highlightedElements.clear();
  }

  /**
   * Removes all subplot highlights.
   */
  private unhighlightSubplotElements(): void {
    this.highlightedSubplots.forEach((element) => {
      Svg.removeSubplotHighlightSvg(element);
    });
    this.highlightedSubplots.clear();
  }

  /**
   * Removes all highlights from both traces and subplots.
   */
  private unhighlightAll(): void {
    this.unhighlightTraceElements();
    this.unhighlightSubplotElements();
  }
}
