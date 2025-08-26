import type { Maidr } from '@type/grammar';
import { DomEventType } from '@type/event';
import { MaidrApp } from '@ui/App';
import { Constant } from '@util/constant';
import { createRoot } from 'react-dom/client';
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
  let maidrContainer: HTMLElement | null = null;
  let controller: Controller | null = null;

  const onFocusOut = (): void => {
    // Allow React to process all the events before focusing out.
    setTimeout(() => {
      if (!maidrContainer) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      const isInside = maidrContainer.contains(activeElement);
      if (!isInside) {
        controller?.dispose();
        controller = null;
      }
    }, 0);
  };
  const onFocusIn = (): void => {
    // Allow React to process all the events before focusing in.
    setTimeout(() => {
      if (!maidrContainer) {
        return;
      }

      if (!controller) {
        // Create a deep copy to prevent mutations on the original maidr object.
        const maidrClone = JSON.parse(JSON.stringify(maidr));
        controller = new Controller(maidrClone, plot);
        // Announce initial instruction on first focus-in
        controller.announceInitialInstruction();
      }
    }, 0);
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      if (controller) {
        controller.dispose();
        controller = null;
      }

      const maidrClone = JSON.parse(JSON.stringify(maidr));
      controller = new Controller(maidrClone, plot);
      controller.announceInitialInstruction();
    }
  };

  const figureElement = document.createElement(Constant.FIGURE);
  figureElement.id = `${Constant.MAIDR_FIGURE}-${maidr.id}`;
  plot.parentNode!.replaceChild(figureElement, plot);
  figureElement.appendChild(plot);

  const articleElement = document.createElement(Constant.ARTICLE);
  articleElement.id = `${Constant.MAIDR_ARTICLE}-${maidr.id}`;
  figureElement.parentNode!.replaceChild(articleElement, figureElement);
  articleElement.appendChild(figureElement);

  const reactContainer = document.createElement(Constant.DIV);
  reactContainer.id = `${Constant.REACT_CONTAINER}-${maidr.id}`;
  figureElement.appendChild(reactContainer);

  maidrContainer = figureElement;
  plot.addEventListener(DomEventType.FOCUS_IN, onFocusIn);
  plot.addEventListener(DomEventType.CLICK, onFocusIn);
  maidrContainer.addEventListener(DomEventType.FOCUS_OUT, onFocusOut);

  document.addEventListener(DomEventType.VISIBILITY_CHANGE, onVisibilityChange);

  const reactRoot = createRoot(reactContainer, { identifierPrefix: maidr.id });
  reactRoot.render(MaidrApp(plot));

  (() => {
    // Create a deep copy to prevent mutations on the original maidr object.
    const maidrClone = JSON.parse(JSON.stringify(maidr));
    const controller = new Controller(maidrClone, plot);
    controller.dispose();
  })();
}
