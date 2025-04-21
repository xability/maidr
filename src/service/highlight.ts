import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import { Constant } from '@util/constant';
import { Svg } from '@util/svg';

export class HighlightService implements Observer<PlotState>, Disposable {
  private readonly highlightedElements: Set<SVGElement>;

  public constructor() {
    this.highlightedElements = new Set<SVGElement>();
  }

  public dispose(): void {
    this.unhighlight();
  }

  public update(state: PlotState): void {
    if (state.empty) {
      return;
    }

    this.unhighlight();
    if (state.type !== 'trace' || state.highlight.empty) {
      return;
    }

    const elements = Array.isArray(state.highlight.elements)
      ? state.highlight.elements
      : [state.highlight.elements];
    this.highlight(elements);
  }

  private highlight(elements: SVGElement[]): void {
    for (const element of elements) {
      const clone = Svg.createHighlightElement(element, Constant.MAIDR_HIGHLIGHT_COLOR);
      clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
      this.highlightedElements.add(clone);
    }
  }

  private unhighlight(): void {
    this.highlightedElements.forEach(element => element.remove());
    this.highlightedElements.clear();
  }
}
