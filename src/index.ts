import type { Maidr } from '@model/grammar';
import { EventType } from '@model/interface';
import { ControllerService } from '@service/controller';
import { DisplayService } from '@service/display';
import { ServiceLocator } from '@service/locator';
import { Constant } from '@util/constant';

document.addEventListener(EventType.DOM_LOADED, main);

function main(): void {
  const plots = document.querySelectorAll<HTMLElement>('[maidr-data]');
  plots.forEach((plot) => {
    const maidrAttr = plot.getAttribute('maidr-data');
    if (!maidrAttr) {
      return;
    }

    try {
      const maidr = JSON.parse(maidrAttr);
      initMaidr(plot, maidr);
    } catch (error) {
      console.error('Error parsing maidr attribute:', error);
    }
  });

  if (plots.length !== 0 && !window.maidr) {
    return;
  }

  const maidr = window.maidr;
  const plot = document.getElementById(maidr.id);
  if (!plot) {
    return;
  }

  initMaidr(plot, maidr);
}

function initMaidr(plot: HTMLElement, maidr: Maidr): void {
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

  maidrRoot = document.createElement(Constant.FIGURE);
  maidrRoot.id = Constant.MAIDR_FIGURE + maidr.id;
  plot.parentNode!.replaceChild(maidrRoot, plot);
  maidrRoot.appendChild(plot);

  const articleElement = document.createElement(Constant.ARTICLE);
  articleElement.id = Constant.MAIDR_ARTICLE + maidr.id;
  maidrRoot.parentNode!.replaceChild(articleElement, maidrRoot);
  articleElement.appendChild(maidrRoot);

  plot.addEventListener(EventType.FOCUS_IN, onFocus);
  plot.addEventListener(EventType.CLICK, onFocus);
  plot.addEventListener(EventType.FOCUS_OUT, onBlur);

  (() => {
    const display = new DisplayService(maidr, maidrRoot, plot);
    display.destroy();
  })();
}
