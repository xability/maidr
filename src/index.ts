import Controller from './core/controller';
import {Maidr} from './plot/grammar';

export enum EventType {
  BLUR = 'blur',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS = 'focus',
  SELECTION_CHANGE = 'selectionchange',
}

document.addEventListener(EventType.DOM_LOADED, test);

function test(): void {
  if (!window.maidr) {
    return;
  }

  const maidrId = window.maidr.id;
  const maidrContainer = document.getElementById(maidrId);
  maidrContainer?.setAttribute('tabindex', '0');
  maidrContainer?.addEventListener(EventType.FOCUS, event =>
    onTestFocus(event)
  );
}

function onTestFocus(event: FocusEvent): void {
  const maidrContainer = event.currentTarget as HTMLElement;
  init(maidrContainer, window.maidr);
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

function init(container: HTMLElement, maidr: Maidr) {
  const control = new Controller(maidr);
  container.addEventListener(EventType.BLUR, () => control.destroy(), {
    once: true,
  });
}
