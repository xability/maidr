import type { Maidr } from '@model/grammar';
import { EventType } from '@model/interface';
import { ControllerService } from '@service/controller';
import { DisplayService } from '@service/display';
import { ServiceLocator } from '@service/locator';
import { Constant } from '@util/constant';

document.addEventListener(EventType.DOM_LOADED, main);

function main(): void {
  if (!window.maidr) {
    return;
  }

  const maidr = window.maidr;
  const maidrId = maidr.id;
  const plot = document.getElementById(maidrId);
  if (!plot) {
    return;
  }

  let maidrRoot: HTMLElement | null = null;
  let controller: ControllerService | null = null;
  let display: DisplayService | null = null;
  const locator: ServiceLocator = ServiceLocator.instance;

  const onBlur = (event: FocusEvent): void => {
    if (!display || !display.shouldDestroy(event)) {
      return;
    }

    controller?.destroy();
    controller = null;
    display = null;

    locator.setController(controller);
  };
  const onFocus = (): void => {
    if (!maidrRoot) {
      return;
    }

    if (!display) {
      display = new DisplayService(maidr, maidrRoot, plot);
    }
    if (!controller) {
      controller = new ControllerService(maidr, display);
    }

    locator.setController(controller);
  };

  maidrRoot = initMaidr(maidr, plot, onFocus, onBlur);
  (() => {
    const display = new DisplayService(maidr, maidrRoot, plot);
    display.destroy();
  })();
}

function initMaidr(
  maidr: Maidr,
  plot: HTMLElement,
  onFocus: () => void,
  onBlur: (event: FocusEvent) => void,
): HTMLElement {
  const figureElement = document.createElement(Constant.FIGURE);
  figureElement.id = Constant.MAIDR_FIGURE + maidr.id;
  plot.parentNode!.replaceChild(figureElement, plot);
  figureElement.appendChild(plot);

  const articleElement = document.createElement(Constant.ARTICLE);
  articleElement.id = Constant.MAIDR_ARTICLE + maidr.id;
  figureElement.parentNode!.replaceChild(articleElement, figureElement);
  articleElement.appendChild(figureElement);

  plot.addEventListener(EventType.FOCUS_IN, onFocus);
  plot.addEventListener(EventType.CLICK, onFocus);
  plot.addEventListener(EventType.FOCUS_OUT, onBlur);

  return figureElement;
}

// These methods have not been used as of now and hence commenting them out for clarity

/*
function main(): void {
  const plotContainers = Array.from(
    document.querySelectorAll<HTMLElement>('svg[maidr-container]')
  );
  for (const container of plotContainers) {
    // Make the container focusable.
    container.setAttribute('tabindex', '0');

    // Handle the MAIDR lifecycle on focus.
    container.addEventListener(EventType.FOCUS, event => onFigureFocus(event));
  }
}

function onFigureFocus(event: FocusEvent) {
  const maidrContainer = event.currentTarget as HTMLElement;
  const maidrData = maidrContainer.getAttribute('maidr-data');
  if (!maidrData) {
    return;
  }

  try {
    const maidr: Maidr = JSON.parse(maidrData);
    init(maidrContainer, maidr);
  } catch (error) {
    console.log(error);
    throw new Error('Error parsing MAIDR data');
  }
}
*/
