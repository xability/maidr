import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { FigureState, HighlightState, SubplotState, TraceState } from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';

export class HighlightService implements Observer<SubplotState | TraceState | FigureState>, Disposable {
  private readonly highlightedElements: Set<SVGElement>; // Track trace highlight clones
  private readonly highlightedSubplots: Set<SVGElement>; // Track subplot highlight elements

  public constructor() {
    this.highlightedElements = new Set();
    this.highlightedSubplots = new Set();
  }

  public dispose(): void {
    this.unhighlightAll();
  }

  public update(state: SubplotState | TraceState | FigureState): void {
    if (state.empty) {
      return;
    }

    this.unhighlightTraceElements(); // Clear previous trace highlights

    if (state.type === 'figure') {
      this.handleFigureState(state); // Handle Figure-level subplot highlighting
    } else if (state.type === 'subplot') {
      this.handleSubplotState(state); // Handle Subplot-level highlighting
    } else {
      this.handleTraceState(state); // Handle Trace-level data point highlighting
    }
  }

  private handleFigureState(state: FigureState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight); // Process Figure's subplot highlighting
    }
  }

  private handleSubplotState(state: SubplotState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight); // Process Subplot's highlighting
    }
  }

  private handleTraceState(state: TraceState): void {
    if (state.empty || state.highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(state.highlight);
    this.highlightTraceElements(elements); // Create clones for trace highlighting
  }

  private processHighlighting(highlight: HighlightState): void {
    if (highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(highlight);
    const isMultiPlot = this.isMultiPlotScenario();

    if (isMultiPlot) {
      this.highlightSubplotElements(elements); // Apply CSS class for subplot highlighting
    } else {
      this.unhighlightSubplotElements(); // Remove highlighting for single plots
    }
  }

  private getElementsFromHighlight(highlight: HighlightState): SVGElement[] {
    if (highlight.empty) {
      return [];
    }
    return Array.isArray(highlight.elements) ? highlight.elements : [highlight.elements]; // Handle single or multiple elements
  }

  private isMultiPlotScenario(): boolean {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;
    return totalSubplots > 1; // Only highlight subplots in multi-plot scenarios
  }

  private highlightTraceElements(elements: SVGElement[]): void {
    for (const element of elements) {
      const clone = this.createHighlightClone(element); // Create visual overlay for data points
      this.highlightedElements.add(clone);
    }
  }

  private createHighlightClone(element: SVGElement): SVGElement {
    const clone = Svg.createHighlightElement(element, Constant.MAIDR_HIGHLIGHT_COLOR);
    clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`; // Unique ID for each clone
    return clone;
  }

  private highlightSubplotElements(elements: SVGElement[]): void {
    this.unhighlightSubplotElements(); // Remove previous subplot highlights

    for (const element of elements) {
      element.classList.add('maidr-subplot-active'); // Add CSS class for subplot highlighting
      this.highlightedSubplots.add(element);
    }
  }

  private unhighlightTraceElements(): void {
    this.highlightedElements.forEach(element => element.remove()); // Remove clone elements from DOM
    this.highlightedElements.clear();
  }

  private unhighlightSubplotElements(): void {
    this.highlightedSubplots.forEach((element) => {
      element.classList.remove('maidr-subplot-active'); // Remove CSS class from subplot elements
    });
    this.highlightedSubplots.clear();
  }

  private unhighlightAll(): void {
    this.unhighlightTraceElements();
    this.unhighlightSubplotElements();
  }
}
