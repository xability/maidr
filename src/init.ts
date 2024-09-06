// import Audio from "./audio";
import Control from "./controls";
import { ChatLLM, Constants, LogError, Resources } from "./constants";
// import Display from "./display";
import Maidr from "./maidr";
import { Position } from "./helpers/position";
import { convertToChartType } from "./helpers/chart_type";
import { getDisplayFromChartType } from "./helpers/utils";
import { Display } from "./display/display";
import { AudioManager } from "./audio/AudioManager";
import { AudioFactory } from "./audio/AudioFactory";

declare global {
  interface Window {
    constants: Constants;
    resources: Resources;
    logError: LogError;

    control: Control | null;
    plot: any;
    position: Position | null;
    audio: AudioManager | null;
    display: Display | null;
    chatLLM: ChatLLM | null;

    maidr: Maidr | null;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  window.constants = new Constants();
  window.resources = new Resources();
  window.logError = new LogError();

  let maidr: Maidr = window.maidr!;
  destroyMaidr();

  const maidrElement = document.getElementById(maidr.id);
  if (maidrElement) {
    maidrElement.setAttribute("tabindex", "0");
    maidrElement.addEventListener("focus", () => onPlotFocus(maidr));
  }
});

function initMaidr(maidr: Maidr) {
  let constants = window.constants;
  if (typeof constants !== "undefined") {
    window.maidr = maidr;
    window.constants.chartId = maidr.id;
    window.constants.chartType = maidr.type;

    createChartComponents(maidr);

    
    // window.display = new Display();
    var chartType = convertToChartType(maidr.type);
    var display = getDisplayFromChartType(chartType);
    window.display = display;
    window.control = new Control();
    window.audio = AudioFactory.createAudio(chartType);

    const controlElements = [
      window.constants.chart,
      window.constants.brailleInput,
    ];
    for (const controlElement of controlElements) {
      if (controlElement)
        window.constants.events.push([controlElement, "blur", onMaidrDestroy]);
    }

    setEvents();

    if ("title" in maidr) {
      window.display?.announceText(maidr.title);
    }
  }
}

function onPlotFocus(maidr: Maidr) {
  if (maidr && maidr.id !== window.maidr?.id) {
    destroyMaidr();
    initMaidr(maidr);
  }
}

function onMaidrDestroy() {
  let constants = window.constants;
  setTimeout(() => {
    if (window.constants.tabMovement === 0) {
      window.constants.tabMovement = null;
    } else if (
      window.constants.tabMovement === 1 ||
      window.constants.tabMovement === -1
    ) {
      onNonFocus();
      destroyMaidr();
    }
  }, 0);
}

function onNonFocus() {
  let constants = window.constants;
  if (window.constants.tabMovement === 1) {
    const focusTemp = document.createElement("div");
    focusTemp.setAttribute("tabindex", "0");
    window.constants.mainContainer?.after(focusTemp);
    focusTemp.focus();
    focusTemp.remove();
  } else if (window.constants.tabMovement === -1) {
    const focusTemp = document.createElement("div");
    focusTemp.setAttribute("tabindex", "0");
    window.constants.mainContainer?.before(focusTemp);
    focusTemp.focus();
    focusTemp.remove();
  }
}

function destroyMaidr() {
  if (window.constants.chartType === "bar") {
    if (window.plot && "deselectAll" in window.plot) {
      window.plot.deselectAll();
    }
    if (window.plot && "deselectPrevious" in window.plot) {
      window.plot.deselectPrevious();
    }
  }

  for (const event of window.constants.events) {
    if (Array.isArray(event[0])) {
      for (const el of event[0]) {
        el.removeEventListener(event[1], event[2] as EventListener);
      }
    } else {
      event[0].removeEventListener(event[1], event[2] as EventListener);
    }
  }

  for (const event of window.constants.postLoadEvents) {
    if (Array.isArray(event[0])) {
      for (const el of event[0]) {
        el.removeEventListener(event[1], event[2]);
      }
    } else {
      event[0].removeEventListener(event[1], event[2]);
    }
  }

  window.constants.events = [];
  window.constants.postLoadEvents = [];

  window.constants.chartId = "";
  window.constants.chartType = "";
  window.constants.tabMovement = null;

  destroyChartComponents();

  window.display = null;
  window.control = null;
  window.plot = null;
  window.audio = null;
  window.maidr = null;
}

function setEvents() {
  for (const event of window.constants.events) {
    if (Array.isArray(event[0])) {
      for (const el of event[0]) {
        el.addEventListener(event[1], event[2] as EventListener);
      }
    } else {
      event[0].addEventListener(event[1], event[2] as EventListener);
    }
  }

  setTimeout(() => {
    for (const event of window.constants.postLoadEvents) {
      if (Array.isArray(event[0])) {
        for (const el of event[0]) {
          el.addEventListener(event[1], event[2]);
        }
      } else {
        event[0].addEventListener(event[1], event[2]);
      }
    }
  }, 100);
}

function createChartComponents(maidr: Maidr) {
  const chart = document.getElementById(maidr.id)!;
  const mainContainer = document.createElement("div");
  const chartContainer = document.createElement("div");
  const constants = window.constants;

  mainContainer.id = window.constants.mainContainerId;
  chartContainer.id = window.constants.chartContainerId;
  chart.parentNode!.replaceChild(mainContainer, chart);
  mainContainer.appendChild(chart);
  chart.parentNode!.replaceChild(chartContainer, chart);
  chartContainer.appendChild(chart);
  chart.focus();

  window.constants.chart = chart;
  window.constants.chartContainer = chartContainer;
  window.constants.mainContainer = mainContainer;

  window.constants.chartContainer.insertAdjacentHTML(
    "beforebegin",
    `<div class="hidden" id="${window.constants.brailleContainerId}">
      <input id="${window.constants.brailleInputId}" class="braille-input" type="text" size="${window.constants.brailleDisplayLength}" autocomplete="off" />
    </div>`
  );

  window.constants.chartContainer.insertAdjacentHTML(
    "afterend",
    `<br><div id="${window.constants.infoId}" aria-live="assertive" aria-atomic="true">
      <p id="x"></p>
      <p id="y"></p>
    </div>`
  );

  document
    .getElementById(window.constants.infoId)!
    .insertAdjacentHTML(
      "afterend",
      `<div id="${window.constants.announcementContainerId}" aria-live="assertive" aria-atomic="true" class="mb-3"></div>`
    );

  window.constants.chartContainer.setAttribute("role", "application");

  window.constants.brailleContainer = document.getElementById(
    window.constants.brailleContainerId
  )!;
  window.constants.brailleInput = document.getElementById(
    window.constants.brailleInputId
  )! as HTMLInputElement;
  window.constants.infoDiv = document.getElementById(window.constants.infoId)!;
  window.constants.announcementContainer = document.getElementById(
    window.constants.announcementContainerId
  )!;
  window.constants.endChime = document.getElementById(
    window.constants.endChimeId
  )!;

  window.chatLLM = new ChatLLM();
}

function destroyChartComponents() {
  let constants = window.constants;
  if (window.constants.chartContainer !== null) {
    if (window.constants.chart !== null) {
      if (window.constants.chartContainer.parentNode !== null) {
        window.constants.chartContainer.parentNode.replaceChild(
          window.constants.chart,
          window.constants.chartContainer
        );
      }
    }
    window.constants.chartContainer.remove();
  }
  if (window.constants.brailleContainer !== null) {
    window.constants.brailleContainer.remove();
  }
  if (window.constants.infoDiv !== null) {
    window.constants.infoDiv.remove();
  }
  if (window.constants.announcementContainer !== null) {
    window.constants.announcementContainer.remove();
  }

  window.constants.chart = null;
  window.constants.chart = null;
  window.constants.brailleContainer = null;
  window.constants.brailleInput = null;
  window.constants.infoDiv = null;
  window.constants.announcementContainer = null;
  window.constants.endChime = null;
}
