/**
 * @jest-environment jsdom
 */

import type { SlideChartBinding, SlideChartOptions } from '@adapters/office/slide';
import type { Maidr } from '@type/grammar';
import type { ReactNode } from 'react';
import { DecompressionStream, ReadableStream } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { bindSlideChart } from '@adapters/office/slide';
import { waitFor } from '@testing-library/react';
import { act } from 'react';
import { FakeOffice } from './fakeOffice';
import { CHART_TYPE, columnChart, deck, DOCUMENT_TYPE, frame, NS, rels, slide, SLIDE_TYPE } from './officeFiles';
import { zipFiles } from './zipFixture';

/** Every set of props the stand-in `<Maidr>` was rendered with, in order. */
const mockRenders: { data: Maidr }[] = [];

/**
 * `<Maidr>` stands in for itself, as in the pane's tests: the real one
 * reaches ESM-only packages, and what is asserted here -- what is shown when,
 * in what order, where focus goes, what is linked and saved -- is the
 * add-in's own.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
    mockRenders.push({ data: props.data });
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    return createElement('div', { 'tabIndex': 0, 'role': 'img', 'data-plot': props.data.id }, props.children);
  },
}));

/**
 * The slide's add-in: one chart, linked and saved in the presentation, shown
 * first; a picker and a Read again button in Normal view, and the figure
 * alone in the slide show.
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
let bindings: SlideChartBinding[] = [];

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

/** The setting the add-in keeps its link under. */
const LINK = 'maidr.chart';

/**
 * Let every pending timer and promise settle, inside `act`. A read of the file
 * is not among them (see the pane's tests), so a test that reads the file
 * again waits for what the read shows, or awaits the read itself.
 */
async function settle(ms = 50): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

async function mount(office: FakeOffice | undefined, options: Omit<SlideChartOptions, 'office'> = {}): Promise<SlideChartBinding> {
  let binding: SlideChartBinding | undefined;
  await act(async () => {
    binding = await bindSlideChart(container, { office, ...options });
  });
  await settle();
  if (binding === undefined) {
    throw new Error('not bound');
  }
  bindings.push(binding);
  return binding;
}

/**
 * A presentation of slides, each with its chart frames as `[shape id, name,
 * chart part]`; the slides' ids count up from 256, as PowerPoint's do.
 */
function presentation(slides: readonly (readonly [number, string, string][])[]): Promise<Uint8Array> {
  const files: Record<string, string> = {
    '_rels/.rels': rels(['rId1', DOCUMENT_TYPE, 'ppt/presentation.xml']),
    'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="${NS.p}" xmlns:r="${NS.r}"><p:sldIdLst>${slides
      .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`)
      .join('')}</p:sldIdLst></p:presentation>`,
    'ppt/_rels/presentation.xml.rels': rels(...slides.map((_, i): [string, string, string] => [`rId${i + 1}`, SLIDE_TYPE, `slides/slide${i + 1}.xml`])),
  };
  slides.forEach((frames, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slide(frames.map(([id, name], j) => frame(id, name, `rId${j + 1}`)).join(''));
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = rels(...frames.map((_, j): [string, string, string] => [`rId${j + 1}`, CHART_TYPE, `../charts/chart${i + 1}-${j + 1}.xml`]));
    frames.forEach(([, , part], j) => {
      files[`ppt/charts/chart${i + 1}-${j + 1}.xml`] = part;
    });
  });
  return zipFiles(files);
}

/** Two slides, a chart on each: `256:4` Sales, `257:4` Costs. */
function twoSlides(): Promise<Uint8Array> {
  return deck([
    { name: 'Chart 3', part: columnChart('Sales', [120, 135]) },
    { name: 'Chart 4', part: columnChart('Costs', [80, 95]) },
  ]);
}

const picker = (): HTMLSelectElement | null => container.querySelector('select');
const options = (): (string | null)[] => Array.from(picker()?.options ?? []).map(option => option.textContent);
const refreshButton = (): HTMLButtonElement | null => container.querySelector('[data-maidr-office-refresh]');
const status = (): HTMLElement | null => container.querySelector('[data-maidr-office-status]');
const shownValues = (binding: SlideChartBinding): unknown => binding.maidr?.subplots[0][0].layers[0].data;

async function choose(chartId: string): Promise<void> {
  const select = picker() as HTMLSelectElement;
  await act(async () => {
    select.value = chartId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

describe('bindSlideChart', () => {
  it('should link the one chart on the slide it is inserted on, save the link, and show it first', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });
    office.selectedSlides = [{ id: 257, title: 'Costs', index: 2 }];

    const binding = await mount(office);

    expect(binding.chart?.label).toBe('Slide 2: Costs');
    expect(shownValues(binding)).toEqual([{ x: 'A', y: 80 }, { x: 'B', y: 95 }]);
    expect(office.savedSettings).toEqual({ [LINK]: { slideId: '257', shapeId: '4', name: 'Chart 4' } });
    expect(container.querySelector('[data-maidr-office-anchor]')?.textContent).toBe('Costs');
    // The figure first, so the first Tab reaches it; then this slide's charts first.
    const parts = Array.from(container.firstElementChild?.children ?? []);
    expect(parts.map(part => part.getAttributeNames()[0])).toEqual([
      'data-maidr-office-view',
      'data-maidr-office-picker',
      'data-maidr-office-actions',
    ]);
    expect(options()).toEqual(['Slide 2: Costs', 'Slide 1: Sales']);
    expect(binding.view).toBe('edit');
    expect(document.activeElement).toBe(document.body);
  });

  it('should ask which chart when its slide has several, and link the one chosen', async () => {
    const bytes = await presentation([
      [[4, 'Chart 3', columnChart('Sales')]],
      [[4, 'Chart 4', columnChart('Costs')], [5, 'Chart 5', columnChart('Profit', [7, 9])]],
    ]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });
    office.selectedSlides = [{ id: 257, title: '', index: 2 }];
    const binding = await mount(office);
    expect(status()?.textContent).toBe('Choose the chart this add-in reads.');
    expect(status()?.tabIndex).toBe(0);
    expect(options()).toEqual(['Choose a chart', 'Slide 2: Costs', 'Slide 2: Profit', 'Slide 1: Sales']);
    expect(office.saves).toBe(0);

    await choose('257:5');

    expect(binding.chart?.label).toBe('Slide 2: Profit');
    expect(shownValues(binding)).toEqual([{ x: 'A', y: 7 }, { x: 'B', y: 9 }]);
    expect(picker()?.value).toBe('257:5');
    expect(office.savedSettings).toEqual({ [LINK]: { slideId: '257', shapeId: '5', name: 'Chart 5' } });
  });

  it('should show the chart linked in the slide show, with nothing but the figure', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({
      host: 'PowerPoint',
      file: () => bytes,
      activeView: 'read',
      settings: { [LINK]: { slideId: '257', shapeId: '4', name: 'Chart 4' } },
    });

    const binding = await mount(office);

    expect(binding.view).toBe('read');
    expect(binding.chart?.label).toBe('Slide 2: Costs');
    expect(container.querySelector('[data-plot]')).not.toBeNull();
    expect(picker()).toBeNull();
    expect(refreshButton()).toBeNull();
    expect(container.querySelector('[data-maidr-office-progress]')).toBeNull();
    expect(office.saves).toBe(0);
  });

  it('should read the chart again as the slide show starts, without the controls, and bring them back after it', async () => {
    let bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales', [1, 2]) }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } } });
    const binding = await mount(office);
    bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales', [10, 20]) }]);

    await act(async () => {
      office.changeView('read');
    });

    expect(picker()).toBeNull();
    expect(refreshButton()).toBeNull();
    await waitFor(() => expect(shownValues(binding)).toEqual([{ x: 'A', y: 10 }, { x: 'B', y: 20 }]));
    expect(binding.view).toBe('read');
    expect(office.fileReads).toBe(2);

    await act(async () => {
      office.changeView('edit');
    });
    await settle();

    expect(binding.view).toBe('edit');
    expect(picker()).not.toBeNull();
    expect(refreshButton()).not.toBeNull();
    expect(office.fileReads).toBe(2);
  });

  it('should save a chart linked in the slide show once Normal view is back', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, activeView: 'read' });
    office.selectedSlides = [{ id: 256, title: 'Sales', index: 1 }];
    const binding = await mount(office);
    expect(binding.chart?.label).toBe('Slide 1: Sales');
    expect(office.saves).toBe(0);

    await act(async () => {
      office.changeView('edit');
    });
    await settle();

    expect(office.savedSettings).toEqual({ [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } });
  });

  it('should say no chart is linked in the slide show when its slide has several', async () => {
    const bytes = await presentation([[[4, 'Chart 4', columnChart('Costs')], [5, 'Chart 5', columnChart('Profit')]]]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, activeView: 'read' });
    office.selectedSlides = [{ id: 256, title: '', index: 1 }];

    const binding = await mount(office);

    expect(binding.chart).toBeNull();
    expect(status()?.textContent).toBe('No chart is linked to this add-in. Link one in Normal view.');
    expect(picker()).toBeNull();
  });

  it('should ask which chart when PowerPoint cannot say which slide is selected', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, noSelection: true });

    const binding = await mount(office);

    expect(binding.chart).toBeNull();
    expect(options()).toEqual(['Choose a chart', 'Slide 1: Sales', 'Slide 2: Costs']);
  });

  it('should link a chart inserted on its slide since, on Read again', async () => {
    let bytes = await presentation([[]]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });
    office.selectedSlides = [{ id: 256, title: '', index: 1 }];
    const binding = await mount(office);
    expect(status()?.textContent).toMatch(/^This presentation has no charts/);
    bytes = await presentation([[[6, 'Chart 5', columnChart('New')]]]);

    await act(async () => {
      refreshButton()?.click();
    });

    await waitFor(() => expect(binding.chart?.label).toBe('Slide 1: New'));
    await settle();
    expect(office.savedSettings).toEqual({ [LINK]: { slideId: '256', shapeId: '6', name: 'Chart 5' } });
  });

  it('should say the chart linked is gone, and offer the picker in Normal view', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '256', shapeId: '9', name: 'Chart 9' } } });

    const binding = await mount(office);

    expect(binding.chart).toBeNull();
    expect(binding.maidr).toBeNull();
    expect(status()?.textContent).toBe('The chart this add-in read is no longer in the presentation. Choose another chart.');
    expect(options()).toEqual(['Choose a chart', 'Slide 1: Sales', 'Slide 2: Costs']);
    expect(office.saves).toBe(0);
  });

  it('should say the chart linked is gone in the slide show, with no picker', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({
      host: 'PowerPoint',
      file: () => bytes,
      activeView: 'read',
      settings: { [LINK]: { slideId: '256', shapeId: '9', name: 'Chart 9' } },
    });

    await mount(office);

    expect(status()?.textContent).toBe('The chart this add-in read is no longer in the presentation. Choose another in Normal view.');
    expect(picker()).toBeNull();
  });

  it('should find the chart linked by its name on its slide when its shape id has changed, and save the new one', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '256', shapeId: '7', name: 'Chart 3' } } });

    const binding = await mount(office);

    expect(binding.chart?.label).toBe('Slide 1: Sales');
    expect(office.savedSettings).toEqual({ [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } });
  });

  it('should not take a chart of the same name on another slide for the one linked', async () => {
    const bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }, { name: 'Chart 3', part: columnChart('Costs') }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '258', shapeId: '4', name: 'Chart 3' } } });

    const binding = await mount(office);

    expect(binding.chart).toBeNull();
    expect(status()?.textContent).toMatch(/no longer in the presentation/);
  });

  it('should ignore a setting that is not a link, and link the chart on its slide', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: 'Chart 3' } });
    office.selectedSlides = [{ id: 256, title: 'Sales', index: 1 }];

    const binding = await mount(office);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/is not a chart's link/), 'Chart 3');
    expect(binding.chart?.label).toBe('Slide 1: Sales');
    expect(office.savedSettings).toEqual({ [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } });
  });

  it('should still show the chart when the link cannot be saved', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, saveFails: true });
    office.selectedSlides = [{ id: 256, title: 'Sales', index: 1 }];

    const binding = await mount(office);

    expect(office.saves).toBe(1);
    expect(office.savedSettings).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Settings\.saveAsync failed/), expect.anything());
    expect(binding.chart?.label).toBe('Slide 1: Sales');
    expect(shownValues(binding)).toEqual([{ x: 'A', y: 120 }, { x: 'B', y: 135 }]);
  });

  it('should take Normal view when PowerPoint cannot say which view is open', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, activeView: null });
    office.selectedSlides = [{ id: 256, title: 'Sales', index: 1 }];

    const binding = await mount(office);

    expect(binding.view).toBe('edit');
    expect(refreshButton()).not.toBeNull();
  });

  it('should say it found no PowerPoint in another application, with no controls', async () => {
    const office = new FakeOffice({ host: 'Word', sets: ['WordApi 1.1'] });

    await mount(office);

    expect(status()?.textContent).toBe('MAIDR could not find PowerPoint. Insert this add-in on a slide in PowerPoint.');
    expect(refreshButton()).toBeNull();
  });

  it('should say it found no PowerPoint outside Office', async () => {
    await mount(undefined);

    expect(status()?.textContent).toMatch(/could not find PowerPoint/);
  });

  it('should say this PowerPoint cannot share its charts when it has no getFileAsync', async () => {
    const office = new FakeOffice({ host: 'PowerPoint' });

    await mount(office);

    expect(status()?.textContent).toMatch(/^This version of PowerPoint cannot share its charts/);
    expect(refreshButton()).toBeNull();
  });

  it('should keep the figure, and MAIDR\'s place in it, when a read finds the chart unchanged', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } } });
    const binding = await mount(office);
    const first = binding.maidr;

    await act(async () => binding.refresh());

    expect(office.fileReads).toBe(2);
    expect(binding.maidr).toBe(first);
    expect(mockRenders.every(render => render.data === first)).toBe(true);
  });

  it('should hand focus to the message when the figure the reader was in gives way to one', async () => {
    let bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } } });
    const binding = await mount(office);
    container.querySelector<HTMLElement>('[data-plot]')?.focus();
    bytes = await deck([{ name: 'Chart 3', part: '<broken/>' }]);

    await act(async () => binding.refresh());

    expect(status()?.textContent).toBe('MAIDR could not read this chart\'s data.');
    expect(document.activeElement).toBe(status());
  });

  it('should leave focus alone when it is not in the figure', async () => {
    let bytes = await deck([{ name: 'Chart 3', part: columnChart('Sales') }]);
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes, settings: { [LINK]: { slideId: '256', shapeId: '4', name: 'Chart 3' } } });
    const binding = await mount(office);
    refreshButton()?.focus();
    bytes = await deck([{ name: 'Chart 3', part: '<broken/>' }]);

    await act(async () => binding.refresh());

    expect(status()).not.toBeNull();
    expect(document.activeElement).toBe(refreshButton());
  });

  it('should stop following the view when disposed', async () => {
    const bytes = await twoSlides();
    const office = new FakeOffice({ host: 'PowerPoint', file: () => bytes });
    const binding = await mount(office);
    expect(office.viewHandlers).toHaveLength(1);

    await act(async () => binding.dispose());

    expect(office.viewHandlers).toHaveLength(0);
    expect(container.children).toHaveLength(0);
  });
});
