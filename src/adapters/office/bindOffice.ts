/**
 * One call for an add-in that runs in Excel, PowerPoint and Word: it mounts
 * the pane for whichever application the page is open in.
 */

import type { ExcelBinding, ExcelBindOptions } from '../excel/binder';
import type { OfficeBinding, OfficeBindOptions } from './binder';
import type { OfficeAppHost, OfficeReadyInfo } from './types';
import { bindExcel } from '../excel/binder';
import { bindPowerPoint, bindWord } from './binder';

/** Options for {@link bindOffice}. */
export interface OfficeAddinOptions extends OfficeBindOptions {
  /** Options for the pane in Excel, which reads charts live; see `bindExcel`. */
  readonly excel?: Omit<ExcelBindOptions, 'office'>;
}

/** The pane {@link bindOffice} mounted: Excel's, or PowerPoint's or Word's. */
export type OfficeAddinBinding = ExcelBinding | OfficeBinding;

/**
 * Mount MAIDR in an Office add-in's task pane, for the application the page
 * is open in: Excel's charts read live through Office.js (`bindExcel`),
 * PowerPoint's and Word's read from the file (`bindPowerPoint`,
 * `bindWord`).
 *
 * Call it from `Office.onReady`. Anywhere else -- in Outlook, or outside
 * Office -- the pane says it found no PowerPoint or Word to read.
 *
 * @param container - The element the pane goes in. A wrapper is appended to it.
 * @param options - Where Office.js is, and how each pane behaves.
 * @returns The binding of the pane mounted. It never rejects.
 */
export async function bindOffice(container: HTMLElement, options: OfficeAddinOptions = {}): Promise<OfficeAddinBinding> {
  const office = options.office
    ?? (typeof window === 'undefined' ? undefined : (window as Window & { Office?: OfficeAppHost }).Office);
  let host: string | null | undefined;
  if (office !== undefined) {
    try {
      const info = (await office.onReady?.()) as OfficeReadyInfo | undefined;
      host = info?.host ?? office.context?.host;
    } catch (error: unknown) {
      console.warn('[MAIDR office] Office.js did not become ready.', error);
    }
  }
  if (host === 'Excel') {
    return bindExcel(container, { ...options.excel, ...(office === undefined ? {} : { office }) });
  }
  if (host === 'Word') {
    return bindWord(container, options);
  }
  return bindPowerPoint(container, options);
}
