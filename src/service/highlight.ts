import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState, SubplotState, TraceState } from '@type/state';
import type { SettingsService } from './settings';
import { Color } from '@util/color';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';

enum HighlightSettings {
  COLOR = 'general.highlightColor',
}

export class HighlightService implements Observer<PlotState>, Disposable {
  private readonly highlightedElements: Set<SVGElement>;
  private highlightColor: string;

  public constructor(settings: SettingsService) {
    this.highlightedElements = new Set();

    this.highlightColor = settings.get<string>(HighlightSettings.COLOR);
    settings.onChange((event) => {
      if (event.affectsSetting(HighlightSettings.COLOR)) {
        this.updateHighlight(this.highlightColor, event.get<string>(HighlightSettings.COLOR));
      }
    });
  }

  public dispose(): void {
    this.unhighlight();
  }

  public update(state: PlotState): void {
    if (state.empty) {
      return;
    }

    this.unhighlight();
    let plot: SubplotState | TraceState | null = null;

    switch (state.type) {
      case 'figure':
        plot = state.subplot;
        break;

      case 'subplot':
        plot = state.trace;
        break;

      case 'trace':
        plot = state;
        break;
    }
    if (plot.empty || plot.highlight.empty) {
      return;
    }

    const highlight = plot.highlight;
    const elements = Array.isArray(highlight.elements) ? highlight.elements : [highlight.elements];
    this.highlight(elements);
  }

  private updateHighlight(oldColor: string, newColor: string): void {
    if (this.highlightedElements.size === 0) {
      return;
    }

    const currentColor = Svg.getColor(this.highlightedElements.values().next().value!);
    if (!Color.isEqual(oldColor, currentColor)) {
      return;
    }

    this.highlightColor = newColor;
    this.highlightedElements.forEach(element => Svg.setColor(element, this.highlightColor));
  }

  private highlight(elements: SVGElement[]): void {
    for (const element of elements) {
      const clone = Svg.createHighlightElement(element, this.highlightColor);
      clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
      this.highlightedElements.add(clone);
    }
  }

  private unhighlight(): void {
    this.highlightedElements.forEach(element => element.remove());
    this.highlightedElements.clear();
  }
}
