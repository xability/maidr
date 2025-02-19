import { EventType } from '@model/interface';
import { ControllerService } from '@service/controller';
import { DisplayService } from '@service/display';

document.addEventListener(EventType.DOM_LOADED, main);

function main(): void {
  // First check for elements with maidr attribute
  const elements = document.querySelectorAll<HTMLElement>('[maidr]');

  elements.forEach((element) => {
    const maidrAttr = element.getAttribute('maidr');
    if (maidrAttr) {
      try {
        const maidr = JSON.parse(maidrAttr);
        initMaidr(element, maidr);
      } catch (error) {
        console.error('Error parsing maidr attribute:', error);
      }
    }
  });

  // Fall back to window.maidr if no attribute found
  if (elements.length === 0 && window.maidr) {
    const maidrId = window.maidr.id;
    const plot = document.getElementById(maidrId);
    if (plot) {
      initMaidr(plot, window.maidr);
    }
  }
}

function initMaidr(element: HTMLElement, maidr: any): void {
  let controller: ControllerService | null = null;
  let display: DisplayService | null = null;

  const onBlur = (event: FocusEvent): void => {
    if (!display || !display.shouldDestroy(event)) {
      return;
    }

    display.addInstruction();
    controller?.destroy();
    controller = null;
  };

  const onFocus = (): void => {
    if (!display) {
      return;
    } else {
      display.removeInstruction();
    }

    if (!controller) {
      controller = new ControllerService(maidr, display);
    }
  };

  display = new DisplayService(maidr, onFocus, onBlur);

  element.addEventListener(EventType.FOCUS, onFocus);
  element.addEventListener(EventType.BLUR, onBlur);
  element.addEventListener(EventType.CLICK, onFocus);

  // Make the element focusable
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '0');
  }
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
