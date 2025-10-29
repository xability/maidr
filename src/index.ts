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

function parseAndInit(
  plot: HTMLElement,
  json: string,
  source: 'maidr' | 'maidr-data',
): void {
  try {
    const maidr = JSON.parse(json) as Maidr;
    initMaidr(maidr, plot);
  } catch (error) {
    console.error(`Error parsing ${source} attribute:`, error);
  }
}

function main(): void {
  const plotsWithMaidr = document.querySelectorAll<HTMLElement>(
    Constant.MAIDR_JSON_SELECTOR,
  );

  if (plotsWithMaidr.length > 0) {
    plotsWithMaidr.forEach((plot) => {
      const maidrAttr = plot.getAttribute(Constant.MAIDR);

      if (!maidrAttr) {
        return;
      }

      parseAndInit(plot, maidrAttr, 'maidr');
    });

    return;
  }

  const plots = document.querySelectorAll<HTMLElement>(`[${Constant.MAIDR_DATA}]`);
  plots.forEach((plot) => {
    const maidrData = plot.getAttribute(Constant.MAIDR_DATA);
    if (!maidrData) {
      return;
    }

    parseAndInit(plot, maidrData, 'maidr-data');
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
    console.error('Plot not found for maidr:', maidr.id);
    return;
  }
  initMaidr(maidr, plot);
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
        return;
      }

      if (!controller) {
        // Create a deep copy to prevent mutations on the original maidr object.
        const maidrClone = JSON.parse(JSON.stringify(maidr));
        controller = new Controller(maidrClone, plot);
      }

      if (!hasAnnounced) {
        hasAnnounced = true; // guard immediately to prevent duplicate focusin/click races

        // Also show visually in Text component (no alert)
        controller.showInitialInstructionInText();
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
  reactContainer.id = `${Constant.REACT_CONTAINER}-${maidr.id}`;
  figureElement.appendChild(reactContainer);

  maidrContainer = figureElement;
  plot.addEventListener(DomEventType.FOCUS_IN, onFocusIn);
  maidrContainer.addEventListener(DomEventType.FOCUS_OUT, onFocusOut);

  document.addEventListener(DomEventType.VISIBILITY_CHANGE, onVisibilityChange);
  plot.addEventListener(DomEventType.CLICK, onFocusIn);

  const reactRoot = createRoot(reactContainer, { identifierPrefix: maidr.id });
  reactRoot.render(MaidrApp(plot));

  (() => {
    // Create a deep copy to prevent mutations on the original maidr object.
    const maidrClone = JSON.parse(JSON.stringify(maidr));
    const controller = new Controller(maidrClone, plot);
    controller.dispose();
  })();
}
