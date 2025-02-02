import React from "react";
import ReactMicroFrontend from "./pages";
import { createRoot } from "react-dom/client";
import { Controller } from "./core/controller";
import { DisplayService } from "./core/service/display";

export enum EventType {
  BLUR = "blur",
  CLICK = "click",
  DOM_LOADED = "DOMContentLoaded",
  FOCUS = "focus",
  KEY_DOWN = "keydown",
  SELECTION_CHANGE = "selectionchange",
}

document.addEventListener(EventType.DOM_LOADED, main);

function main(): void {
  if (!window.maidr) {
    return;
  }

  const maidr = window.maidr;
  const maidrId = maidr.id;
  const plot = document.getElementById(maidrId);
  if (!plot) {
    return;
  }

  const onFocus = () => {
    if (!controller) {
      controller = new Controller(maidr, display);
    }
    const rootDiv = document.createElement("div");
    rootDiv.id = "root";
    document.body.appendChild(rootDiv);

    if (rootDiv) {
      const root = createRoot(rootDiv);
      root.render(
        React.createElement(ReactMicroFrontend, {
          frontendManager: controller.frontend,
        }),
      );
    }
    display.removeInstruction();
  };
  const onBlur = (event: FocusEvent) => {
    if (display.shouldDestroy(event)) {
      display.addInstruction();
      controller?.destroy();
      controller = null;
    }
  };

  const display = new DisplayService(maidr, onFocus, onBlur);
  let controller: Controller | null = null;

  plot?.addEventListener(EventType.FOCUS, onFocus);
  plot?.addEventListener(EventType.BLUR, onBlur);
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
