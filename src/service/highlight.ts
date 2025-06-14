import type { SettingsService } from '@service/settings';
import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { Settings } from '@type/settings';
import type { SubplotState, TraceState } from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';

type HighlightState = SubplotState | TraceState | Settings;

export class HighlightService implements Observer<HighlightState>, Disposable {
  private readonly highlightedElements: Map<SVGElement, SVGElement>;
  private currentHighlightColor: string;

  public constructor(settings: SettingsService) {
    this.highlightedElements = new Map();
    const initialSettings = settings.loadSettings();
    this.currentHighlightColor = initialSettings.general.highlightColor;
  }

  public dispose(): void {
    this.clear();
  }

  private isSettings(state: HighlightState): state is Settings {
    return 'general' in state;
  }

  private createHighlightElement(element: SVGElement): SVGElement {
    if (!(element instanceof SVGElement)) {
      throw new TypeError('Invalid element provided for highlight creation');
    }

    const clone = Svg.createHighlightElement(element, this.currentHighlightColor);
    clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
    return clone;
  }

  private handleSettingsUpdate(settings: Settings): void {
    this.currentHighlightColor = settings.general.highlightColor;
  }

  private handleStateUpdate(state: SubplotState | TraceState): void {
    if (state.empty) {
      return;
    }

    this.clear();
    const trace = state.type === Constant.MAIDR_SUBPLOT ? state.trace : state;
    if (trace.empty || trace.highlight.empty) {
      return;
    }

    const elements = Array.isArray(trace.highlight.elements)
      ? trace.highlight.elements
      : [trace.highlight.elements];

    elements.forEach((element) => {
      try {
        const highlightElement = this.createHighlightElement(element);
        this.highlightedElements.set(element, highlightElement);
      } catch (error) {
        console.error('Failed to highlight element:', error);
      }
    });
  }

  public update(state: HighlightState): void {
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

  public clear(): void {
    try {
      this.highlightedElements.forEach((highlightElement) => {
        highlightElement.remove();
      });
      this.highlightedElements.clear();
    } catch (error) {
      console.error('Failed to clear highlights:', error);
    }
  }
}
