import Controller from './core/controller';
import DisplayManager from './core/manager/display';
import {Maidr} from './plot/grammar';

export enum EventType {
  BLUR = 'blur',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS = 'focus',
  FOCUS_OUT = 'focusout',
  SELECTION_CHANGE = 'selectionchange',
}

// Stores the onLoad generated display object
let initDisplay: DisplayManager | null = null;

document.addEventListener(EventType.DOM_LOADED, test);

function test(): void {
  if (!window.maidr) {
    return;
  }

  const maidrId = window.maidr.id;
  const maidrContainer = document.getElementById(maidrId);
  if (maidrContainer) {
    initDisplay = new DisplayManager(maidrId);
  }
  // attaching focus to the figureWrapper
  maidrContainer?.parentElement?.addEventListener(EventType.FOCUS, event =>
    onTestFocus(event, initDisplay!)
  );
}

function onTestFocus(event: FocusEvent, display: DisplayManager): void {
  const maidrContainer = event.target as HTMLElement;
  // Passing the onLoad generated display object
  init(maidrContainer, window.maidr, display);
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

function init(container: HTMLElement, maidr: Maidr, display: DisplayManager) {
  const control = new Controller(maidr, display);
  container.addEventListener(
    'focusout',
    () => {
      // Delay the execution of the event handler by 2 seconds and check if active element is within the invoking container.
      setTimeout(() => {
        if (container.contains(document.activeElement)) {
          return;
        }
        control.destroy();
      }, 100);
    },
    {
      once: true,
    }
  );
}
