import Controller from './core/controller';
import DisplayManager from './core/manager/display';
import Constant from './util/constant';

export enum EventType {
  BLUR = 'blur',
  CLICK = 'click',
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
      const target = document.getElementById(maidrId);
      if (target) {
        target.setAttribute(Constant.ROLE, Constant.APPLICATION);
      }
    }
  };
  const onBlur = (event: FocusEvent) => {
    const relatedTarget = event.relatedTarget as HTMLElement;
    if (isSibling(maidrContainer, relatedTarget)) {
      // Focus is moving to sibling of plot, do nothing
      return;
    }
    maidrContainer.setAttribute(Constant.ROLE, Constant.IMAGE);
    controller?.destroy();
    controller = null;
  };

  const onClickOrKeydown = (event: MouseEvent | KeyboardEvent) => {
    if (event instanceof KeyboardEvent && event.key !== ' ') {
      return;
    }
    if (!controller) {
      controller = new Controller(window.maidr, display);
    }
    const target = document.getElementById(maidrId);
    if (target) {
      target.setAttribute(Constant.ROLE, Constant.APPLICATION);
    }
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }
  };

  const display = new DisplayManager(maidrId, onFocus, onBlur);
  const figureElement = document.getElementById(maidrId);
  let controller: Controller | null = null;

  figureElement?.addEventListener(EventType.FOCUS, onFocus);
  figureElement?.addEventListener(EventType.BLUR, onBlur);
  figureElement?.addEventListener(EventType.CLICK, onClickOrKeydown);
}

const isSibling = (
  element: HTMLElement | null,
  relatedTarget: HTMLElement | null
): boolean => {
  if (!element || !relatedTarget) {
    return false;
  }

  const parent = element.parentNode;
  return !!parent && parent.contains(relatedTarget) && parent !== relatedTarget;
};
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
