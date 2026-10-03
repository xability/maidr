/**
 * @jest-environment jsdom
 */

import type { ExcelBinding, ExcelBindOptions } from '@adapters/excel/binder';
import type { Maidr } from '@type/grammar';
import type { ReactNode } from 'react';
import type { FakeBook, FakeChartData } from './fakeOffice';
import { bindExcel } from '@adapters/excel/binder';
import { TraceType } from '@type/grammar';
import { act } from 'react';
import { FakeExcelHost, fakeOffice } from './fakeOffice';

/**
 * Every set of props the stand-in `<Maidr>` was rendered with, in order.
 *
 * Named `mock…` so Jest lets the hoisted factory below close over it.
 */
const mockRenders: { data: Maidr }[] = [];

/**
 * `<Maidr>` stands in for itself, for the reason the Power BI binder's tests
 * give: it reaches ESM-only packages through the chat panel, and this project
 * compiles to CommonJS. What this file asserts -- the picker, what is shown
 * when, where focus goes, which Office.js handlers are registered and removed
 * -- is the binder's own work. The stub records the props it was given and
 * renders a focusable plot around its children, as the real one does.
 */
jest.mock('../../../src/maidr-component', () => ({
  Maidr: (props: { data: Maidr; children: ReactNode }): ReactNode => {
    mockRenders.push({ data: props.data });
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    return createElement('div', { 'tabIndex': 0, 'role': 'img', 'data-plot': props.data.id }, props.children);
  },
}));

/**
 * The Excel binder: the task pane's picker, figure and messages, kept in step
 * with a workbook through Office.js events.
 *
 * 1. **The pane can be driven from itself.** Every chart is in a labelled
 *    native `<select>`; choosing one reads it.
 * 2. **It follows the workbook, and only forward.** Activating a chart in the
 *    grid shows it; deactivating -- which F6 into the pane does -- keeps it.
 * 3. **A message is always reachable.** No chart, an unsupported type, an
 *    older Excel: each is a focusable status, and focus is handed over when
 *    the figure the reader was in gives way to one, or comes back.
 * 4. **Nothing is left registered.** `dispose()` removes every handler it
 *    added, through the context it was added in.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

afterAll(() => {
  warn.mockRestore();
});

function sales(values = ['120', '135', '150']): FakeChartData {
  return {
    id: '{sales}',
    name: 'Chart 1',
    chartType: 'ColumnClustered',
    title: { text: 'Sales', visible: true },
    axes: { category: { text: 'Quarter', visible: true }, value: { text: 'Dollars', visible: true } },
    series: [{ name: 'Sales', chartType: 'ColumnClustered', categories: ['Q1', 'Q2', 'Q3'], values }],
    image: 'U0FMRVM=',
  };
}

const VISITS: FakeChartData = {
  id: '{visits}',
  name: 'Chart 2',
  chartType: 'Line',
  title: { text: 'Visits', visible: true },
  series: [{ name: 'Visits', chartType: 'Line', categories: ['Jan', 'Feb'], values: ['10', '12'] }],
};

const TREEMAP: FakeChartData = {
  id: '{tree}',
  name: 'Chart 3',
  chartType: 'Treemap',
  axes: null,
  series: [{ name: 'Sizes', chartType: 'Treemap', categories: ['a'], values: ['1'] }],
};

function workbook(): FakeBook {
  return {
    activeChartId: null,
    sheets: [
      { id: '{s1}', name: 'Sales', charts: [sales(), VISITS] },
      { id: '{s2}', name: 'Shapes', charts: [TREEMAP] },
    ],
  };
}

let container: HTMLElement;
let host: FakeExcelHost;
const bindings: ExcelBinding[] = [];

async function bind(options: ExcelBindOptions = {}, data: FakeBook = workbook()): Promise<ExcelBinding> {
  host = new FakeExcelHost(data);
  let binding: ExcelBinding | undefined;
  await act(async () => {
    binding = await bindExcel(container, { excel: host, office: fakeOffice('1.15'), refreshDelay: 5, ...options });
  });
  if (binding === undefined) {
    throw new Error('expected a binding');
  }
  bindings.push(binding);
  return binding;
}

/** Let a fired event's work, and any debounce, finish. */
async function settle(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

async function fire(action: () => Promise<void>): Promise<void> {
  await act(async () => {
    await action();
  });
  await settle();
}

function picker(): HTMLSelectElement {
  const select = container.querySelector('select');
  if (select === null) {
    throw new Error('expected the picker');
  }
  return select;
}

function status(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-maidr-excel-status]');
}

function plot(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-plot]');
}

function lastData(): Maidr {
  const last = mockRenders.at(-1);
  if (last === undefined) {
    throw new Error('expected <Maidr> to have rendered');
  }
  return last.data;
}

async function choose(chartId: string): Promise<void> {
  await act(async () => {
    const select = picker();
    select.value = chartId;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  mockRenders.length = 0;
  warn.mockClear();
});

afterEach(async () => {
  for (const binding of bindings.splice(0)) {
    await act(async () => {
      await binding.dispose();
    });
  }
  document.body.innerHTML = '';
});

describe('excel binder', () => {
  describe('the pane', () => {
    it('appends one wrapper, tagged with the figure id, and touches nothing else', async () => {
      const existing = document.createElement('p');
      container.append(existing);

      await bind({ id: 'pane' });

      expect(container.children).toHaveLength(2);
      expect(container.firstElementChild).toBe(existing);
      expect(container.querySelector('[data-maidr-excel]')?.getAttribute('data-maidr-excel')).toBe('pane');
    });

    it('offers every chart in a labelled picker, as "Sheet - title"', async () => {
      await bind();

      const select = picker();
      const label = container.querySelector(`label[for="${select.id}"]`);
      expect(label?.textContent).toBe('Chart');
      expect([...select.options].map(option => option.textContent)).toEqual([
        'Sales - Sales',
        'Sales - Visits',
        'Shapes - Chart 3',
      ]);
    });

    it('shows the first chart when none is active, with its picture inside MAIDR\'s figure', async () => {
      const binding = await bind({ id: 'pane' });

      expect(picker().value).toBe('{sales}');
      expect(binding.chart?.label).toBe('Sales - Sales');
      expect(lastData()).toMatchObject({ id: 'pane', title: 'Sales', live: true });
      expect(lastData().subplots[0][0].layers[0].type).toBe(TraceType.BAR);
      const image = plot()?.querySelector('img');
      expect(image?.getAttribute('src')).toBe('data:image/png;base64,U0FMRVM=');
      // Decorative: MAIDR's figure is what is named.
      expect(image?.getAttribute('alt')).toBe('');
    });

    it('shows the active chart when there is one', async () => {
      const data = workbook();
      data.activeChartId = '{visits}';

      await bind({}, data);

      expect(picker().value).toBe('{visits}');
      expect(lastData().subplots[0][0].layers[0].type).toBe(TraceType.LINE);
    });

    it('shows the chart\'s label where the picture could not be read', async () => {
      const data = workbook();
      data.sheets[0].charts[0].image = new Error('GeneralException');

      await bind({}, data);

      expect(plot()?.querySelector('img')).toBeNull();
      expect(plot()?.querySelector('[data-maidr-excel-anchor]')?.textContent).toBe('Sales - Sales');
    });

    it('reads category cells only where Excel has ExcelApi 1.15', async () => {
      const data = workbook();
      data.sheets[0].charts[0].series[0].categorySource = { type: 'LocalRange', address: 'Sales!$A$2:$A$4' };
      data.sheets[0].cells = { A1: 'Period', A2: 'Q1', A3: 'Q2', A4: 'Q3' };
      data.sheets[0].charts[0].axes = { value: { text: 'Dollars', visible: true } };

      await bind({ office: fakeOffice('1.14') }, data);
      expect(lastData().subplots[0][0].layers[0].axes?.x).toBeUndefined();

      await bind({ office: fakeOffice('1.15') }, data);
      expect(lastData().subplots[0][0].layers[0].axes?.x).toEqual({ label: 'Period' });
    });
  });

  describe('choosing a chart', () => {
    it('reads the chart chosen in the picker', async () => {
      const binding = await bind();

      await choose('{visits}');

      expect(binding.chart?.id).toBe('{visits}');
      expect(lastData().title).toBe('Visits');
      expect(picker().value).toBe('{visits}');
    });

    it('keeps focus on the picker while the reader chooses', async () => {
      await bind();
      picker().focus();

      await choose('{visits}');
      await choose('{tree}');

      expect(document.activeElement).toBe(picker());
    });

    it('shows a focusable message naming a chart type MAIDR cannot read', async () => {
      const binding = await bind();

      await choose('{tree}');

      expect(binding.maidr).toBeNull();
      expect(status()?.textContent).toBe('MAIDR cannot read Treemap charts yet. Choose another chart.');
      expect(status()?.getAttribute('role')).toBe('status');
      expect(status()?.tabIndex).toBe(0);
      expect(picker().value).toBe('{tree}');
    });

    it('can be driven from the binding', async () => {
      const binding = await bind();

      await act(async () => {
        await binding.show('{visits}');
      });

      expect(binding.chart?.id).toBe('{visits}');
    });
  });

  describe('following the workbook', () => {
    it('shows a chart the user activates in the grid', async () => {
      const binding = await bind();

      await fire(() => host.activate('{visits}'));

      expect(binding.chart?.id).toBe('{visits}');
      expect(picker().value).toBe('{visits}');
    });

    it('keeps the last chart when it is deactivated, as moving into the pane does', async () => {
      const binding = await bind();
      await fire(() => host.activate('{visits}'));
      const renders = mockRenders.length;

      await fire(() => host.deactivate('{visits}'));
      await act(async () => {
        await binding.refresh();
      });

      expect(binding.chart?.id).toBe('{visits}');
      expect(mockRenders).toHaveLength(renders);
    });

    it('can leave the choice to the picker alone', async () => {
      const binding = await bind({ followActiveChart: false });

      await fire(() => host.activate('{visits}'));

      expect(binding.chart?.id).toBe('{sales}');
      expect(host.handlerCount('charts.{s1}.onActivated')).toBe(0);
    });

    it('re-reads the chart once after a burst of cell changes', async () => {
      const binding = await bind();
      const runs = host.runs;

      host.book.sheets[0].charts[0] = sales(['1', '2', '3']);
      await act(async () => {
        void host.fire('worksheets.onChanged', {});
        void host.fire('worksheets.onChanged', {});
        void host.fire('worksheets.onChanged', {});
      });
      await settle();

      expect(host.runs).toBe(runs + 1);
      expect(binding.maidr?.subplots[0][0].layers[0].data).toEqual([
        { x: 'Q1', y: 1 },
        { x: 'Q2', y: 2 },
        { x: 'Q3', y: 3 },
      ]);
    });

    it('does not re-render when a change leaves the chart as it was', async () => {
      await bind();
      const renders = mockRenders.length;
      const before = lastData();

      await fire(() => host.fire('worksheets.onChanged', {}));

      expect(mockRenders).toHaveLength(renders);
      expect(lastData()).toBe(before);
    });

    it('keeps the figure\'s data when only the picture changed', async () => {
      await bind();
      const before = lastData();

      host.book.sheets[0].charts[0].image = 'TkVX';
      await fire(() => host.fire('worksheets.onChanged', {}));

      expect(plot()?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,TkVX');
      expect(lastData()).toBe(before);
    });

    it('lists a chart added to the workbook', async () => {
      const binding = await bind();

      host.book.sheets[0].charts.push({ ...VISITS, id: '{new}', name: 'Chart 4', title: { text: 'Costs', visible: true } });
      await fire(() => host.fire('charts.{s1}.onAdded', {}));

      expect(binding.charts.map(chart => chart.label)).toContain('Sales - Costs');
      expect(binding.chart?.id).toBe('{sales}');
    });

    it('says so when the chart on show is deleted, and offers the rest', async () => {
      const binding = await bind();

      host.book.sheets[0].charts.shift();
      await fire(() => host.fire('charts.{s1}.onDeleted', {}));

      expect(binding.maidr).toBeNull();
      expect(status()?.textContent).toBe('That chart is no longer in the workbook. Choose another chart.');
      expect(picker().value).toBe('');
      expect([...picker().options].map(option => [option.value, option.disabled])).toEqual([
        ['', true],
        ['{visits}', false],
        ['{tree}', false],
      ]);
    });

    it('follows the charts of a worksheet added later', async () => {
      const binding = await bind();
      host.book.sheets.push({ id: '{s3}', name: 'Later', charts: [{ ...VISITS, id: '{late}' }] });

      await fire(() => host.fire('worksheets.onAdded', { worksheetId: '{s3}' }));
      await fire(() => host.activate('{late}'));

      expect(host.handlerCount('charts.{s3}.')).toBe(3);
      expect(binding.chart?.id).toBe('{late}');
    });
  });

  describe('messages', () => {
    it('says so when the workbook has no charts, with no picker', async () => {
      const binding = await bind({}, { sheets: [{ id: '{s1}', name: 'Empty', charts: [] }] });

      expect(binding.charts).toEqual([]);
      expect(container.querySelector('select')).toBeNull();
      expect(status()?.textContent).toMatch(/^This workbook has no charts to read/);
    });

    it('says so when every value of the chart is blank', async () => {
      const data = workbook();
      data.sheets[0].charts[0] = sales(['', '', '']);

      await bind({}, data);

      expect(status()?.textContent).toBe('This chart has no data to read.');
      expect(picker().value).toBe('{sales}');
    });

    it('tells a reader on an Excel without ExcelApi 1.12 why nothing is read, and reads nothing', async () => {
      const binding = await bind({ office: fakeOffice('1.11') });

      expect(status()?.textContent).toMatch(/^This version of Excel cannot share its charts with add-ins/);
      expect(status()?.tabIndex).toBe(0);
      expect(host.runs).toBe(0);
      expect(host.handlerCount()).toBe(0);
      await act(async () => {
        await binding.show('{sales}');
      });
      expect(host.runs).toBe(0);
    });

    it('says so when the page is not in Excel at all', async () => {
      let binding: ExcelBinding | undefined;
      await act(async () => {
        binding = await bindExcel(container, {});
      });
      bindings.push(binding as ExcelBinding);

      expect(status()?.textContent).toBe('MAIDR could not find Excel. Open this page as an Excel add-in.');
      expect(String(warn.mock.calls[0]?.[0])).toContain('Office.js is not loaded');
    });

    it('says so when Office.js is loaded but not in Excel, as in a browser on its own', async () => {
      // What Office.js does outside Office: it becomes ready with no host and
      // loads no Excel API.
      const office = { context: {}, onReady: async () => ({ host: null }) };
      let binding: ExcelBinding | undefined;
      await act(async () => {
        binding = await bindExcel(container, { office });
      });
      bindings.push(binding as ExcelBinding);

      expect(status()?.textContent).toBe('MAIDR could not find Excel. Open this page as an Excel add-in.');
      expect(String(warn.mock.calls[0]?.[0])).toContain('found no Excel');
    });

    it('finds the Excel API Office.js loads by the time it is ready', async () => {
      // Office.js loads the Excel API for its host after the page's scripts
      // have run, so a pane bound before Office.onReady must look for it after.
      host = new FakeExcelHost(workbook());
      const scope = window as Window & { Excel?: unknown };
      const office = {
        ...fakeOffice('1.15'),
        onReady: async () => {
          scope.Excel = host;
          return { host: 'Excel' };
        },
      };
      let binding: ExcelBinding | undefined;
      try {
        await act(async () => {
          binding = await bindExcel(container, { office });
        });
      } finally {
        delete scope.Excel;
      }
      bindings.push(binding as ExcelBinding);

      expect(binding?.chart?.id).toBe('{sales}');
      expect(plot()).not.toBeNull();
    });

    it('shows a failed read, and recovers on the next one', async () => {
      const binding = await bind();
      host.failSyncs = new Error('GeneralException');

      await act(async () => {
        await binding.refresh();
      });
      expect(status()?.textContent).toBe('MAIDR could not read this chart.');

      host.failSyncs = null;
      await act(async () => {
        await binding.refresh();
      });
      expect(binding.maidr).not.toBeNull();
    });

    it('takes its wording from the labels option', async () => {
      await bind({ labels: { picker: 'Diagramm', unsupported: 'Kein {type}' } });

      await choose('{tree}');

      expect(container.querySelector('label')?.textContent).toBe('Diagramm');
      expect(status()?.textContent).toBe('Kein Treemap');
    });
  });

  describe('focus', () => {
    it('hands focus to the message when the figure the reader was in gives way to it', async () => {
      await bind();
      plot()?.focus();

      host.book.sheets[0].charts[0] = sales(['', '', '']);
      await fire(() => host.fire('worksheets.onChanged', {}));

      expect(document.activeElement).toBe(status());
    });

    it('hands focus back to the figure when the data returns', async () => {
      const data = workbook();
      data.sheets[0].charts[0] = sales(['', '', '']);
      await bind({}, data);
      status()?.focus();

      host.book.sheets[0].charts[0] = sales();
      await fire(() => host.fire('worksheets.onChanged', {}));

      expect(document.activeElement).toBe(plot());
    });

    it('leaves focus alone when the reader is elsewhere', async () => {
      const outside = document.createElement('button');
      document.body.append(outside);
      await bind();
      outside.focus();

      await fire(() => host.activate('{tree}'));

      expect(document.activeElement).toBe(outside);
    });
  });

  describe('office.js events', () => {
    it('registers for cell changes, worksheets and every worksheet\'s charts', async () => {
      await bind();

      expect(host.handlerCount('worksheets.onChanged')).toBe(1);
      expect(host.handlerCount('worksheets.onAdded')).toBe(1);
      expect(host.handlerCount('worksheets.onDeleted')).toBe(1);
      for (const sheet of ['{s1}', '{s2}']) {
        expect(host.handlerCount(`charts.${sheet}.onActivated`)).toBe(1);
        expect(host.handlerCount(`charts.${sheet}.onAdded`)).toBe(1);
        expect(host.handlerCount(`charts.${sheet}.onDeleted`)).toBe(1);
      }
      // Deactivation is never listened to: it changes nothing.
      expect(host.handlerCount('charts.{s1}.onDeactivated')).toBe(0);
    });

    it('still binds on an Office.js that lacks an event, and says which', async () => {
      const data = workbook();
      host = new FakeExcelHost(data);
      host.missingEvents.add('worksheets.onChanged');
      let binding: ExcelBinding | undefined;
      await act(async () => {
        binding = await bindExcel(container, { excel: host, office: fakeOffice('1.15') });
      });
      bindings.push(binding as ExcelBinding);

      expect(binding?.maidr).not.toBeNull();
      expect(String(warn.mock.calls.at(-1)?.[0])).toContain('worksheet changed');
    });

    it('unregisters every handler on dispose, and is safe to call twice', async () => {
      const binding = await bind();
      await fire(() => host.fire('worksheets.onAdded', { worksheetId: '{s2}' }));
      expect(host.handlerCount()).toBeGreaterThan(0);

      await act(async () => {
        await binding.dispose();
        await binding.dispose();
      });

      expect(host.handlerCount()).toBe(0);
      expect(container.querySelector('[data-maidr-excel]')).toBeNull();
    });

    it('does nothing for an event that arrives after dispose', async () => {
      const binding = await bind();
      const runs = host.runs;
      const handlers = [...(host.handlers.get('charts.{s1}.onActivated') ?? [])];
      await act(async () => {
        await binding.dispose();
      });

      await act(async () => {
        await Promise.all(handlers.map(handler => (handler as (event: unknown) => Promise<unknown>)({ chartId: '{visits}', worksheetId: '{s1}' })));
      });
      await settle();

      expect(host.runs).toBe(runs);
      expect(container.childNodes).toHaveLength(0);
    });
  });
});
