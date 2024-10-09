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
    console.log(maidrContainer);
  }
  maidrContainer?.parentElement?.addEventListener(EventType.FOCUS, event =>
    onTestFocus(event, initDisplay!)
  );
}

function onTestFocus(event: FocusEvent, display: DisplayManager): void {
  console.log('Element that received focus:', event.target);
  const maidrContainer = event.target as HTMLElement;
  init(maidrContainer, window.maidr, display);
}

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

function init(container: HTMLElement, maidr: Maidr, display?: DisplayManager) {
  const control = new Controller(maidr, display);
  container.addEventListener(
    'focusout',
    () => {
      // console.log('Container focusout:', container);
      // console.log(
      //   'active element in destroy invocation',
      //   document.activeElement
      // );

      // Delay the execution of the event handler by 2 seconds
      setTimeout(() => {
        // Check if the new active element is within the container
        if (container.contains(document.activeElement)) {
          // console.log('Focus moved within the container, no action taken.');
          return;
        }

        // console.log('Focus moved outside the container, destroying control.');
        control.destroy();
      }, 2000);
    },
    {
      once: true,
    }
  );

  // console.log('init container', container);
  // console.log('active element in init', document.activeElement);

  // Additional logging to check focus movement
  // setTimeout(() => {
  //   console.log('active element after init timeout', document.activeElement);
  // }, 0);
}
