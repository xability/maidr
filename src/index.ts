import Controller from './core/controller';
import DisplayManager from './core/manager/display';
import Constant from './util/constant';

export enum EventType {
  BLUR = 'blur',
  DOM_LOADED = 'DOMContentLoaded',
  FOCUS = 'focus',
  SELECTION_CHANGE = 'selectionchange',
}

document.addEventListener(EventType.DOM_LOADED, main);

function main(): void {
  if (!window.maidr) {
    return;
  }

  const maidrId = window.maidr.id;
  const maidrContainer = document.getElementById(maidrId);
  if (!maidrContainer) {
    return;
  }

  const onFocus = () => {
    {
      if (!controller) {
        controller = new Controller(window.maidr, display);
      }
    }
  };
  const onBlur = (event: FocusEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (figureElement?.contains(relatedTarget)) {
      // Focus is moving within the figure, do not destroy.
      return;
    }

    controller?.destroy();
    controller = null;
  };

  const display = new DisplayManager(maidrId, onFocus, onBlur);
  const figureElement = document.getElementById(
    Constant.MAIDR_FIGURE + maidrId
  );
  let controller: Controller | null = null;

  figureElement?.addEventListener(EventType.FOCUS, onFocus);
  figureElement?.addEventListener(EventType.BLUR, onBlur);
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
