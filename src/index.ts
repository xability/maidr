import type { Maidr } from '@type/maidr';
import { ControllerService } from '@service/controller';
import { ServiceLocator } from '@service/locator';
import { EventType } from '@type/event';
import { Constant } from '@util/constant';

if (document.readyState === 'loading') {
  // Support for regular HTML loading.
  document.addEventListener(EventType.DOM_LOADED, main);
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
  let controller: ControllerService | null = null;
  const locator: ServiceLocator = ServiceLocator.instance;

  const onBlur = (event: FocusEvent): void => {
    if (!locator.display.shouldDestroy(event)) {
      return;
    }

    controller?.destroy();
    controller = null;

    locator.setController(controller);
  };
  const onFocus = (): void => {
    if (!maidrRoot) {
      return;
    }

    if (!controller) {
      controller = new ControllerService(maidr, maidrRoot, plot);
    }

    locator.setController(controller);
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
  plot.addEventListener(EventType.FOCUS_IN, onFocus);
  plot.addEventListener(EventType.CLICK, onFocus);
  plot.addEventListener(EventType.FOCUS_OUT, onBlur);

  (() => {
    const controller = new ControllerService(maidr, maidrRoot, plot);
    controller.destroy();
  })();
}
