/**
 * @jest-environment jsdom
 */

import type { OfficeBinding } from '@adapters/office/binder';
import type { Maidr } from '@type/grammar';
import type { ReactNode } from 'react';
import { DecompressionStream, ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { bindPowerPoint, bindWord } from '@adapters/office/binder';
import { bindOffice } from '@adapters/office/bindOffice';
import { waitFor } from '@testing-library/react';
import { act } from 'react';
import { FakeOffice, FakePowerPoint, FakeWord } from './fakeOffice';
import { columnChart, deck, wordDocument } from './officeFiles';

/** Every set of props the stand-in `<Maidr>` was rendered with, in order. */
const mockRenders: { data: Maidr }[] = [];

/**
 * `<Maidr>` stands in for itself, as in the Excel binder's tests: the real
 * one reaches ESM-only packages, and what is asserted here -- the picker,
 * what is shown when, where focus goes, what is read -- is the binder's own.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
    mockRenders.push({ data: props.data });
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    return createElement('div', { 'tabIndex': 0, 'role': 'img', 'data-plot': props.data.id }, props.children);
  },
}));

/**
 * The PowerPoint and Word binders: the task pane's picker, figure, messages
 * and Read again button, kept in step with the selection.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

beforeAll(() => {
  Object.assign(globalThis, {
    DecompressionStream: globalThis.DecompressionStream ?? DecompressionStream,
    ReadableStream: globalThis.ReadableStream ?? ReadableStream,
    TextDecoder: globalThis.TextDecoder ?? TextDecoder,
    TextEncoder: globalThis.TextEncoder ?? TextEncoder,
  });
});

let container: HTMLElement;
let bindings: OfficeBinding[] = [];

beforeEach(() => {
  container = document.createElement('main');
  document.body.appendChild(container);
  mockRenders.length = 0;
  warn.mockClear();
});

afterEach(async () => {
  await act(async () => {
    await Promise.all(bindings.map(binding => binding.dispose()));
  });
  bindings = [];
  container.remove();
});

afterAll(() => {
  warn.mockRestore();
});

/**
 * Let every pending timer and promise settle, inside `act`. A read of the file
 * is not among them: it inflates the file's parts through
 * `DecompressionStream`, which takes as long as the machine makes it, so a
 * test that reads the file again waits for what the read shows instead.
 */
async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

async function mount(bind: () => Promise<OfficeBinding>): Promise<OfficeBinding> {
  let binding: OfficeBinding | undefined;
  await act(async () => {
    binding = await bind();
  });
  await settle();
  if (binding === undefined) {
    throw new Error('not bound');
  }
  bindings.push(binding);
  return binding;
}

const picker = (): HTMLSelectElement | null => container.querySelector('select');
const status = (): HTMLElement | null => container.querySelector('[data-maidr-office-status]');
const progress = (): string => container.querySelector('[data-maidr-office-progress]')?.textContent ?? '';
const shownValues = (binding: OfficeBinding): unknown => binding.maidr?.subplots[0][0].layers[0].data;

describe('bindPowerPoint', () => {
  async function presentation(): Promise<{ office: FakeOffice; powerpoint: FakePowerPoint; bytes: Uint8Array }> {
    const bytes = await deck([
      { name: 'Chart 3', part: columnChart('Sales', [120, 135]) },
      { name: 'Chart 4', part: columnChart('Costs', [80, 95]) },
    ]);
    const office = new FakeOffice({ host: 'PowerPoint', sets: ['PowerPointApi 1.5'], file: () => bytes });
    return { office, powerpoint: new FakePowerPoint(['256#', '257#']), bytes };
  }

  it('should list every chart by slide and show the first, when nothing is selected', async () => {
    const { office, powerpoint } = await presentation();

    const binding = await mount(() => bindPowerPoint(container, { office, powerpoint, selectionDelay: 0 }));

    expect(Array.from(picker()?.options ?? []).map(option => option.textContent)).toEqual(['Slide 1: Sales', 'Slide 2: Costs']);
    expect(binding.chart?.label).toBe('Slide 1: Sales');
    expect(shownValues(binding)).toEqual([{ x: 'A', y: 120 }, { x: 'B', y: 135 }]);
    expect(progress()).toBe('Charts read: 2.');
    expect(office.open).toBe(false);
  });

  it('should show the chart chosen in the picker', async () => {
    const { office, powerpoint } = await presentation();
    const binding = await mount(() => bindPowerPoint(container, { office, powerpoint, selectionDelay: 0 }));
    const select = picker() as HTMLSelectElement;

    await act(async () => {
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(binding.chart?.label).toBe('Slide 2: Costs');
  });

  it('should follow the chart selected on a slide', async () => {
    const { office, powerpoint } = await presentation();
    const binding = await mount(() => bindPowerPoint(container, { office, powerpoint, selectionDelay: 0 }));

    powerpoint.selectedSlide = powerpoint.slides[1];
    powerpoint.selectedShapes = [{ id: '4', name: 'Chart 4', type: 'Chart' }];
    office.selectionChanged();
    await settle();

    expect(binding.chart?.label).toBe('Slide 2: Costs');
  });

  it('should read the file again when the chart selected is one added since it was read', async () => {
    let bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }]);
    const office = new FakeOffice({ host: 'PowerPoint', sets: ['PowerPointApi 1.5'], file: () => bytes });
    const powerpoint = new FakePowerPoint(['256#']);
    const binding = await mount(() => bindPowerPoint(container, { office, powerpoint, selectionDelay: 0 }));
    bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }, { name: 'Chart 9', part: columnChart('New') }]);
    powerpoint.slides = [{ id: '256#' }, { id: '257#' }];

    powerpoint.selectedSlide = powerpoint.slides[1];
    powerpoint.selectedShapes = [{ id: '4', name: 'Chart 9', type: 'Chart' }];
    office.selectionChanged();

    await waitFor(() => expect(binding.chart?.label).toBe('Slide 2: New'));
    expect(office.fileReads).toBe(2);
  });

  it('should leave the chart on show when the selection is not a chart', async () => {
    const { office, powerpoint } = await presentation();
    const binding = await mount(() => bindPowerPoint(container, { office, powerpoint, selectionDelay: 0 }));

    powerpoint.selectedSlide = powerpoint.slides[1];
    powerpoint.selectedShapes = [{ id: '2', name: 'Title 1', type: 'Placeholder' }];
    office.selectionChanged();
    await settle();

    expect(binding.chart?.label).toBe('Slide 1: Sales');
    expect(office.fileReads).toBe(1);
  });

  it('should read the file again on Read again, and keep the chart on show', async () => {
    let bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales', [1, 2]) }, { name: 'Chart 4', part: columnChart('Costs', [3, 4]) }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });
    const binding = await mount(() => bindPowerPoint(container, { office, selectionDelay: 0 }));
    await act(async () => binding.show(binding.charts[1].id));
    bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales', [1, 2]) }, { name: 'Chart 4', part: columnChart('Costs', [30, 40]) }]);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-maidr-office-refresh]')?.click();
    });

    await waitFor(() => expect(shownValues(binding)).toEqual([{ x: 'A', y: 30 }, { x: 'B', y: 40 }]));
    expect(office.fileReads).toBe(2);
    expect(binding.chart?.label).toBe('Slide 2: Costs');
  });

  it('should say so, focusably, when the presentation has no charts', async () => {
    const empty = await deck([]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => empty });

    await mount(() => bindPowerPoint(container, { office }));

    expect(status()?.textContent).toMatch(/no charts/);
    expect(status()?.tabIndex).toBe(0);
    expect(container.querySelector('[data-maidr-office-refresh]')).not.toBeNull();
  });

  it('should say it could not read the charts when PowerPoint fails to hand over the file', async () => {
    const office = new FakeOffice({ host: 'PowerPoint', fileFails: true });

    await mount(() => bindPowerPoint(container, { office }));

    expect(status()?.textContent).toBe('MAIDR could not read the charts.');
  });

  it('should say this PowerPoint cannot share its charts when it has no getFileAsync', async () => {
    const office = new FakeOffice({ host: 'PowerPoint' });

    await mount(() => bindPowerPoint(container, { office }));

    expect(status()?.textContent).toMatch(/^This version of PowerPoint cannot share its charts/);
  });

  it('should say it found no PowerPoint outside Office', async () => {
    await mount(() => bindPowerPoint(container, { office: undefined }));

    expect(status()?.textContent).toMatch(/could not find PowerPoint or Word/);
  });

  it('should say a chart whose part is gone cannot be read', async () => {
    const bytes = await deck([{ name: 'Chart 3', part: '<not a chart/>' }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });

    const binding = await mount(() => bindPowerPoint(container, { office }));

    expect(binding.maidr).toBeNull();
    expect(status()?.textContent).toBe('MAIDR could not read this chart\'s data.');
  });

  it('should hand focus to the message when the figure the reader was in gives way to one', async () => {
    const bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }, { name: 'Chart 4', part: '<broken/>' }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });
    const binding = await mount(() => bindPowerPoint(container, { office }));
    container.querySelector<HTMLElement>('[data-plot]')?.focus();

    await act(async () => binding.show(binding.charts[1].id));

    expect(document.activeElement).toBe(status());
  });

  it('should stop following the selection when disposed', async () => {
    const { office, powerpoint } = await presentation();
    const binding = await mount(() => bindPowerPoint(container, { office, powerpoint }));
    expect(office.selectionHandlers).toHaveLength(1);

    await act(async () => binding.dispose());

    expect(office.selectionHandlers).toHaveLength(0);
    expect(container.children).toHaveLength(0);
  });
});

describe('bindWord', () => {
  const body = wordDocument([
    { id: 1, name: 'Chart 1', part: columnChart('Sales', [1, 2]) },
    { id: 5, name: 'Chart 5', part: columnChart('Costs', [3, 4]) },
  ]);

  it('should list a document\'s charts in reading order and show the first', async () => {
    const office = new FakeOffice({ host: 'Word', sets: ['WordApi 1.1'] });
    const word = new FakeWord(body);

    const binding = await mount(() => bindWord(container, { office, word }));

    expect(binding.charts.map(chart => chart.label)).toEqual(['Chart 1: Sales', 'Chart 2: Costs']);
    expect(binding.chart?.id).toBe('1');
  });

  it('should show the chart selected, read from the selection as it is now', async () => {
    const office = new FakeOffice({ host: 'Word', sets: ['WordApi 1.1'] });
    const word = new FakeWord(body);
    const binding = await mount(() => bindWord(container, { office, word, selectionDelay: 0 }));

    word.selection = wordDocument([{ id: 5, name: 'Chart 5', part: columnChart('Costs', [30, 40]) }]);
    office.selectionChanged();
    await settle();

    expect(binding.chart?.label).toBe('Chart 2: Costs');
    expect(shownValues(binding)).toEqual([{ x: 'A', y: 30 }, { x: 'B', y: 40 }]);
  });

  it('should say this Word cannot share its charts without WordApi 1.1', async () => {
    const office = new FakeOffice({ host: 'Word' });

    await mount(() => bindWord(container, { office, word: new FakeWord(body) }));

    expect(status()?.textContent).toMatch(/^This version of Word cannot share its charts/);
  });
});

describe('bindOffice', () => {
  it('should mount Word\'s pane in Word', async () => {
    const word = new FakeWord(wordDocument([{ id: 1, name: 'Chart 1', part: columnChart('Sales') }]));
    const inWord = new FakeOffice({ host: 'Word', sets: ['WordApi 1.1'] });

    let binding: Awaited<ReturnType<typeof bindOffice>> | undefined;
    await act(async () => {
      binding = await bindOffice(container, { office: inWord, word });
    });
    bindings.push(binding as OfficeBinding);

    expect((binding as OfficeBinding).host).toBe('Word');
    expect((binding as OfficeBinding).charts).toHaveLength(1);
  });

  it('should mount Excel\'s pane in Excel', async () => {
    const office = new FakeOffice({ host: 'Excel', sets: ['ExcelApi 1.12'] });

    let binding: Awaited<ReturnType<typeof bindOffice>> | undefined;
    await act(async () => {
      binding = await bindOffice(container, { office });
    });
    await settle();

    // No Excel namespace here, so Excel's own pane says it found none.
    expect(container.querySelector('[data-maidr-excel-status]')?.textContent).toMatch(/could not find Excel/);
    await act(async () => binding?.dispose());
  });

  it('should say it found no PowerPoint or Word in another host', async () => {
    const office = new FakeOffice({ host: 'Outlook' });

    let binding: Awaited<ReturnType<typeof bindOffice>> | undefined;
    await act(async () => {
      binding = await bindOffice(container, { office });
    });
    bindings.push(binding as OfficeBinding);

    expect(status()?.textContent).toMatch(/could not find PowerPoint or Word/);
  });
});
