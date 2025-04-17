import type { Disposable } from '@type/disposable';
import type { Observer } from '@type/observable';
import type { PlotState } from '@type/state';
import { Color } from '@util/color';
import { Constant } from '@util/constant';

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
      const clone = element.cloneNode(true) as SVGElement;
      const originalColor = window.getComputedStyle(element).getPropertyValue(Constant.FILL);

      clone.id = `${Constant.MAIDR_HIGHLIGHT}-${Date.now()}-${Math.random()}`;
      clone.style.fill = this.getHighlightColor(originalColor);
      clone.style.visibility = Constant.VISIBLE;

      element.insertAdjacentElement(Constant.AFTER_END, clone);
      this.highlightedElements.add(clone);
    }
  }

  private unhighlight(): void {
    this.highlightedElements.forEach(element => element.remove());
    this.highlightedElements.clear();
  }

  private getHighlightColor(originalColor: string): string {
    const originalRgb = Color.parse(originalColor);
    if (!originalRgb) {
      return Constant.MAIDR_HIGHLIGHT_COLOR;
    }

    const invertedRgb = Color.invert(originalRgb);
    const contrastRatio = Color.getContrastRatio(originalRgb, invertedRgb);
    if (contrastRatio >= 4.5) {
      return Color.rgbToString(invertedRgb);
    }

    return Constant.MAIDR_HIGHLIGHT_COLOR;
  }
}
