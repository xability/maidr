import { Maidr } from "./core/maidr";
import { initialize } from "esbuild";
import Audio from "./engine/audio";
import Display from "./engine/display";
import Control from "./engine/control";

export enum EventType {
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS = 'focus',
}

document.addEventListener(EventType.DOM_LOADED, main);

function main(): void {
  const plotContainers = document.querySelectorAll<HTMLElement>('div[maidr-container]');
  for (const container of plotContainers) {
    // Make the container focusable.
    container.setAttribute('tabindex', '0');

    // Handle the MAIDR lifecycle only on focus.
    container.addEventListener(EventType.FOCUS, onFigureFocus);

    // TODO: Handle `blur` event to destroy the created objects.
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
    throw new Error('Error parsing MAIDR data.');
  }
}

function init(container: HTMLElement, maidr: Maidr) {
  const audio = new Audio();
  const display = new Display();
  const control = new Control();
}
