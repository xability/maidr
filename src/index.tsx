import type { Maidr } from './type/grammar';
import { DomEventType } from './type/event';
import { Constant } from './util/constant';
import { initMaidrOnElement } from './util/initMaidr';

declare global {
  interface Window {
    maidr?: Maidr;
  }
}

if (document.readyState === 'loading') {
  // Support for regular HTML loading.
  document.addEventListener(DomEventType.DOM_LOADED, main);
} else {
  // Support for Jupyter Notebook, since it is in `complete` state.
  main();
}

function parseAndInit(
  plot: HTMLElement,
  json: string,
  source: 'maidr' | 'maidr-data',
): void {
  try {
    const maidr = JSON.parse(json) as Maidr;
    initMaidrOnElement(maidr, plot);
  } catch (error) {
    console.error(`Error parsing ${source} attribute:`, error);
  }
}

function main(): void {
  const plotsWithMaidr = document.querySelectorAll<HTMLElement>(
    Constant.MAIDR_JSON_SELECTOR,
  );

  if (plotsWithMaidr.length > 0) {
    plotsWithMaidr.forEach((plot) => {
      const maidrAttr = plot.getAttribute(Constant.MAIDR);

      if (!maidrAttr) {
        return;
      }

      parseAndInit(plot, maidrAttr, 'maidr');
    });

    return;
  }

  const plots = document.querySelectorAll<HTMLElement>(`[${Constant.MAIDR_DATA}]`);
  plots.forEach((plot) => {
    const maidrData = plot.getAttribute(Constant.MAIDR_DATA);
    if (!maidrData) {
      return;
    }

    parseAndInit(plot, maidrData, 'maidr-data');
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
    console.error('Plot not found for maidr:', maidr.id);
    return;
  }
  initMaidrOnElement(maidr, plot);
}
