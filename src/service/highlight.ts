import type { Context } from '@model/context';
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

type HighlightStateUnion = SubplotState | TraceState | FigureState | Settings;

export class HighlightService
implements Observer<HighlightStateUnion>, Disposable {
  private readonly highlightedElements: Map<SVGElement, SVGElement>;
  private readonly highlightedSubplots: Set<SVGElement>;
  private currentHighlightColor: string;

  private highContrastMode: boolean = false;
  private defaultBackgroundColor: string = '';
  private defaultForegroundColor: string = '';

  public constructor(settings: SettingsService) {
    this.highlightedElements = new Map();
    this.highlightedSubplots = new Set();
    const initialSettings = settings.loadSettings();
    this.currentHighlightColor = initialSettings.general.highlightColor;
  }

  public dispose(): void {
    this.unhighlightAll();
  }

  private isSettings(state: HighlightStateUnion): state is Settings {
    return 'general' in state;
  }

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

  private handleSettingsUpdate(settings: Settings): void {
    this.currentHighlightColor = settings.general.highlightColor;
  }

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

  private handleFigureState(state: FigureState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  private handleSubplotState(state: SubplotState): void {
    if (!state.empty) {
      this.processHighlighting(state.highlight);
    }
  }

  private handleTraceState(state: TraceState): void {
    if (state.empty || state.highlight.empty) {
      return;
    }

    const elements = this.getElementsFromHighlight(state.highlight);
    this.highlightTraceElements(elements);
  }

  public toggleHighContrast(context: Context): void {
    // toggle with 'h'

    // todo: add to settings, and save state
    // also, use 008A00 as default highlight color during high contrast mode

    // bookmark: debugging heatmap. text isn't always the same color and it messes up bad
    // prolly need a full on exception here, and maybe others. ugh.
    // push first tho?

    const lightColor = 'white';
    const darkColor = 'black';

    const svg = document.getElementById(context.id);
    if (!svg)
      return;

    const svgElements = svg.querySelectorAll('*');

    if (this.highContrastMode) {
      this.highContrastMode = false;
      document.body.style.backgroundColor = this.defaultBackgroundColor;
      document.body.style.color = this.defaultForegroundColor;

      svg.removeAttribute('style');
      svgElements.forEach((el) => {
        // Restore fill/stroke from style attribute
        const originalFill = el.getAttribute('data-original-fill');
        const originalStroke = el.getAttribute('data-original-stroke');
        const style = el.getAttribute('style') || '';

        let newStyle = style;
        if (originalFill) {
          newStyle = newStyle.replace(/fill:[^;]+/i, `fill:${originalFill}`);
          el.removeAttribute('data-original-fill');
        }
        if (originalStroke) {
          newStyle = newStyle.replace(
            /stroke:[^;]+/i,
            `stroke:${originalStroke}`,
          );
          el.removeAttribute('data-original-stroke');
        }
        if (newStyle !== style)
          el.setAttribute('style', newStyle);

        // Restore fill/stroke attributes
        const attrFill = el.getAttribute('data-attr-fill');
        const attrStroke = el.getAttribute('data-attr-stroke');

        if (attrFill) {
          el.setAttribute('fill', attrFill);
          el.removeAttribute('data-attr-fill');
        }

        if (attrStroke) {
          el.setAttribute('stroke', attrStroke);
          el.removeAttribute('data-attr-stroke');
        }
      });
    } else {
      this.highContrastMode = true;
      this.defaultBackgroundColor = document.body.style.backgroundColor;
      this.defaultForegroundColor = document.body.style.color;
      document.body.style.backgroundColor = darkColor;
      document.body.style.color = lightColor;

      svg.setAttribute('style', 'fill:white');
      svgElements.forEach((el) => {
        // Handle style fill/stroke
        const style = el.getAttribute('style') || '';
        const fillMatch = style.match(/fill:\s*([^;]+)/i);
        const strokeMatch = style.match(/stroke:\s*([^;]+)/i);

        let newStyle = style;

        if (fillMatch) {
          const originalFill = fillMatch[1];
          el.setAttribute('data-original-fill', originalFill);
          const newFill = this.isWhiteish(originalFill)
            ? darkColor
            : lightColor;
          newStyle = newStyle.replace(/fill:[^;]+/i, `fill:${newFill}`);
        }

        if (strokeMatch) {
          const originalStroke = strokeMatch[1];
          el.setAttribute('data-original-stroke', originalStroke);
          const newStroke = this.isWhiteish(originalStroke)
            ? darkColor
            : lightColor;
          newStyle = newStyle.replace(/stroke:[^;]+/i, `stroke:${newStroke}`);
        }

        if (newStyle !== style)
          el.setAttribute('style', newStyle);

        // Handle fill/stroke attributes
        const attrFill = el.getAttribute('fill');
        if (attrFill) {
          el.setAttribute('data-attr-fill', attrFill);
          el.setAttribute(
            'fill',
            this.isWhiteish(attrFill) ? darkColor : lightColor,
          );
        }

        const attrStroke = el.getAttribute('stroke');
        if (attrStroke) {
          el.setAttribute('data-attr-stroke', attrStroke);
          el.setAttribute(
            'stroke',
            this.isWhiteish(attrStroke) ? darkColor : lightColor,
          );
        }
      });
    }
  }

  private isWhiteish(value: string): boolean {
    if (value === 'none' || value === 'transparent') {
      return false;
    }

    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx)
      return false;

    ctx.fillStyle = '#000';
    ctx.fillStyle = value.trim();
    const hex = ctx.fillStyle;

    if (!/^#[0-9a-f]{6}$/i.test(hex))
      return false;

    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);

    return r >= 229 && g >= 229 && b >= 229;
  }

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

  private getElementsFromHighlight(highlight: HighlightState): SVGElement[] {
    if (highlight.empty) {
      return [];
    }
    return Array.isArray(highlight.elements)
      ? highlight.elements
      : [highlight.elements];
  }

  private isMultiPlotScenario(): boolean {
    const totalSubplots = document.querySelectorAll('g[id^="axes_"]').length;
    return totalSubplots > 1;
  }

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
      this.unhighlightSubplotElements();
    } catch (error) {
      console.error('Failed to clear highlights:', error);
    }
  }

  private unhighlightTraceElements(): void {
    this.highlightedElements.forEach((highlightElement) => {
      highlightElement.remove();
    });
    this.highlightedElements.clear();
  }

  private unhighlightSubplotElements(): void {
    this.highlightedSubplots.forEach((element) => {
      Svg.removeSubplotHighlightSvg(element);
    });
    this.highlightedSubplots.clear();
  }

  private unhighlightAll(): void {
    this.unhighlightTraceElements();
    this.unhighlightSubplotElements();
  }
}
