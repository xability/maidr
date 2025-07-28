import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { SubplotState, TraceState } from '@type/state';
import type { SettingsService } from './settings';
import { Color } from '@util/color';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';

enum HighlightSettings {
  COLOR = 'general.highlightColor',
}

export class HighlightService implements Observer<SubplotState | TraceState>, Disposable {
  private readonly settingsService: SettingsService;

  private readonly highlightedElements: Set<SVGElement>;
  private highlightColor: string;

  public constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
    this.highlightedElements = new Set();

    this.highlightColor = this.settingsService.get<string>(HighlightSettings.COLOR);
    this.settingsService.onChange((event) => {
      if (event.affectsSetting(HighlightSettings.COLOR)) {
        const oldColor = this.highlightColor;
        this.highlightColor = this.settingsService.get<string>(HighlightSettings.COLOR);
        if (this.highlightedElements.size === 0) {
          return;
        }

        const currentColor = Svg.getColor(this.highlightedElements.values().next().value!);
        if (!Color.isEqual(oldColor, currentColor)) {
          return;
        }

        this.highlightedElements.forEach(element => Svg.setColor(element, this.highlightColor));
      }
    });
  }

  public dispose(): void {
    this.unhighlight();
  }

  public update(state: SubplotState | TraceState): void {
    if (state.empty) {
      return;
    }

    this.unhighlight();
    const trace = state.type === 'subplot' ? state.trace : state;
    if (trace.empty || trace.highlight.empty) {
      return;
    }

    const highlight = trace.highlight;
    const elements = Array.isArray(highlight.elements) ? highlight.elements : [highlight.elements];
    this.highlight(elements);
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
