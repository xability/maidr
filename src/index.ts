import type { Maidr } from './type/grammar';
import { createRoot } from 'react-dom/client';
import { Controller } from './controller';
import { DomEventType } from './type/event';
import { MaidrApp } from './ui/App';
import { Constant } from './util/constant';

if (document.readyState === 'loading') {
  // Support for regular HTML loading.
  document.addEventListener(DomEventType.DOM_LOADED, main);
} else {
  // Support for Jupyter Notebook, since it is in `complete` state.
  main();
}

function main(): void {
  overrideFigureMargin();

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
}

function overrideFigureMargin(): void {
  const style = document.createElement(Constant.STYLE);
  style.textContent = `[id^='${Constant.MAIDR_FIGURE}'] { ${Constant.MARGIN}: 0; }`;
  document.head.appendChild(style);
}

function initMaidr(maidr: Maidr, plot: HTMLElement): void {
  let maidrContainer: HTMLElement | null = null;
  let controller: Controller | null = null;
  let hasAnnounced = false;

  const onFocusOut = (): void => {
    // Allow React to process all the events before focusing out.
    setTimeout(() => {
      if (!maidrContainer) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement;
      const isInside = maidrContainer.contains(activeElement);
      if (!isInside) {
        if (controller) {
          controller.dispose();
        }
        controller = null;
        hasAnnounced = false;
      }
    }, 0);
  };
  const onFocusIn = (): void => {
    // Allow React to process all the events before focusing in.
    setTimeout(() => {
      if (!maidrContainer) {
      if (!maidrContainer) {
        return;
      }

      if (!controller) {
        // Create a deep copy to prevent mutations on the original maidr object.
        const maidrClone = JSON.parse(JSON.stringify(maidr));
        controller = new Controller(maidrClone, plot);
      }
    }, 0);
  };
  const onVisibilityChange = (): void => {
    // Allow React to process all the events before focusing in.
    setTimeout(() => {
      if (document.visibilityState === 'hidden') {
        return;
      }

      if (controller) {
        controller.dispose();
        controller = null;
        onFocusIn();
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
      // Do not announce here; focus-in will handle one-shot announcement
      hasAnnounced = false;
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
  const reactContainer = document.createElement(Constant.DIV);
  reactContainer.id = `${Constant.REACT_CONTAINER}-${maidr.id}`;
  figureElement.appendChild(reactContainer);

  maidrContainer = figureElement;
  plot.addEventListener(DomEventType.FOCUS_IN, onFocusIn);
  maidrContainer.addEventListener(DomEventType.FOCUS_OUT, onFocusOut);
  document.addEventListener(DomEventType.VISIBILITY_CHANGE, onVisibilityChange);

  const reactRoot = createRoot(reactContainer, { identifierPrefix: maidr.id });
  reactRoot.render(MaidrApp(plot));

  (() => {
    // Create a deep copy to prevent mutations on the original maidr object.
    const maidrClone = JSON.parse(JSON.stringify(maidr));
    const controller = new Controller(maidrClone, plot);
    const controller = new Controller(maidrClone, plot);
    controller.dispose();
  })();
}
