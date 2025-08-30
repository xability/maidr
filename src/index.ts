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
        // Clear SR-only instruction via controller before disposing
        if (controller) {
          console.log('[MAIDR][a11y] focusout: clearing SR instruction and disposing controller');
          controller.clearInitialInstructionForScreenReaders();
          controller.dispose();
        }
        controller = null;
        hasAnnounced = false;
      }
    }, 0);
  };
  const onFocusIn = (event: Event): void => {
    // Allow React to process all the events before focusing in.
    setTimeout(() => {
      if (!maidrContainer) {
        return;
      }

      console.log('[MAIDR][a11y] focusin handler fired', {
        eventType: event?.type,
        hasAnnounced,
        hasController: Boolean(controller),
        activeElement: (document.activeElement as HTMLElement)?.id,
      });

      if (!controller) {
        // Create a deep copy to prevent mutations on the original maidr object.
        const maidrClone = JSON.parse(JSON.stringify(maidr));
        controller = new Controller(maidrClone, plot);
        console.log('[MAIDR][a11y] controller created');
      }

      if (!hasAnnounced) {
        hasAnnounced = true; // guard immediately to prevent duplicate focusin/click races
        console.log('[MAIDR][a11y] preparing initial instruction for SR and Text');
        // Delegate DOM attributes to Controller/DisplayService
        controller.prepareInitialInstructionForScreenReaders();

        // Also show visually in Text component (no alert)
        controller.showInitialInstructionInText();

        // Confirm flag
        console.log('[MAIDR][a11y] marked hasAnnounced=true');
      }
    }, 0);
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      if (controller) {
        console.log('[MAIDR][a11y] visibilitychange: disposing existing controller');
        controller.dispose();
        controller = null;
      }
      const maidrClone = JSON.parse(JSON.stringify(maidr));
      controller = new Controller(maidrClone, plot);
      // Do not announce here; focus-in will handle one-shot announcement
      hasAnnounced = false;
      controller.clearInitialInstructionForScreenReaders();
      console.log('[MAIDR][a11y] visibilitychange: reset hasAnnounced=false and cleared SR instruction');
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

  const reactRoot = createRoot(reactContainer, { identifierPrefix: maidr.id });
  reactRoot.render(MaidrApp(plot));

  (() => {
    // Create a deep copy to prevent mutations on the original maidr object.
    const maidrClone = JSON.parse(JSON.stringify(maidr));
    const controller = new Controller(maidrClone, plot);
    controller.dispose();
  })();
}
