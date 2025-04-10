import type { Maidr } from '@type/maidr';
import { DomEventType } from '@type/event';
import { Constant } from '@util/constant';
import { Controller } from './controller';

if (document.readyState === 'loading') {
  // Support for regular HTML loading.
  document.addEventListener(DomEventType.DOM_LOADED, main);
} else {
  // Support for Jupyter Notebook, since it is in `complete` state.
  main();
}

function main(): void {
  const plots = document.querySelectorAll<HTMLElement>(`[${Constant.MAIDR_DATA}]`);
  plots.forEach((plot) => {
    const maidrData = plot.getAttribute(Constant.MAIDR_DATA);
    if (!maidrData) {
      return;
    }

    try {
      const maidr = JSON.parse(maidrData);
      initMaidr(maidr, plot);
    } catch (error) {
      console.error('Error parsing maidr attribute:', error);
    }
  });

  // Fall back to window.maidr if no attribute found.
  // TODO: Need to be removed along with `window.d.ts`,
  //  once attribute method is migrated.
  if (plots.length !== 0) {
    return;
  }

  const maidr = window.maidr;
  if (!maidr) {
    return;
  }

  const plot = document.getElementById(maidr.id);
  if (!plot) {
    return;
  }
  initMaidr(maidr, plot);
}

function initMaidr(maidr: Maidr, plot: HTMLElement): void {
  let maidrRoot: HTMLElement | null = null;
  let controller: Controller | null = null;

  const onBlur = (event: FocusEvent): void => {
    if (!controller || !controller.shouldDispose(event)) {
      return;
    }

    controller?.dispose();
    controller = null;
  };
  const onFocus = (): void => {
    if (!maidrRoot) {
      return;
    }

    if (!controller) {
      // Create a deep copy to prevent mutations on the original maidr object.
      const maidrClone = JSON.parse(JSON.stringify(maidr));
      controller = new Controller(maidrClone, maidrRoot, plot);
    }
  };

  const figureElement = document.createElement(Constant.FIGURE);
  figureElement.id = Constant.MAIDR_FIGURE + maidr.id;
  plot.parentNode!.replaceChild(figureElement, plot);
  figureElement.appendChild(plot);

  const articleElement = document.createElement(Constant.ARTICLE);
  articleElement.id = Constant.MAIDR_ARTICLE + maidr.id;
  figureElement.parentNode!.replaceChild(articleElement, figureElement);
  articleElement.appendChild(figureElement);

  maidrRoot = figureElement;
  plot.addEventListener(DomEventType.FOCUS_IN, onFocus);
  plot.addEventListener(DomEventType.CLICK, onFocus);
  plot.addEventListener(DomEventType.FOCUS_OUT, onBlur);

  (() => {
    // Create a deep copy to prevent mutations on the original maidr object.
    const maidrClone = JSON.parse(JSON.stringify(maidr));
    const controller = new Controller(maidrClone, maidrRoot, plot);
    controller.dispose();
  })();
}
