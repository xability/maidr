import type { Frame, Page } from '@playwright/test';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { BarPlotPage } from '../page-objects/plots/barplot-page';

/**
 * E2E coverage for the experimental WebMCP tools (docs/WEBMCP.md).
 *
 * No browser ships WebMCP by default, so an init script stands in for
 * `document.modelContext`: it keeps each registered tool on `window.__tools`
 * and drops it when its signal aborts, as the draft specifies. The tools are on
 * by default; a second init script adds the page's `maidr-webmcp` meta tag,
 * when a test wants one, before MAIDR mounts on DOMContentLoaded.
 * The tools are then called the way an agent would, and the reader's side is
 * checked the way liveData.spec.ts checks it: through the aria text region
 * and `document.activeElement`.
 *
 * Uses examples/barplot.html, a single bar chart with id "bar" and layer "0"
 * (Sat 87, Sun 76, Thur 62, Fri 19; x labels formatted to full day names).
 * Requires a built bundle (dist/maidr.js), like every other spec.
 */

type ToolResult = Record<string, unknown> & { content?: Record<string, unknown> };

/** A tool call a relay hands the chart's frame. */
interface RelayCall {
  name: string;
  input: unknown;
  noBrowserFocus?: boolean;
}

/** Reads the MAIDR aria text region. */
async function ariaText(page: Page): Promise<string> {
  return page.evaluate(
    () => document.querySelector('[id^="react-container"]')?.textContent ?? '',
  );
}

/** Polls until the aria text region contains the expected substring. */
async function waitForAriaText(page: Page, expected: string): Promise<void> {
  await page.waitForFunction(
    (needle) => {
      const text = document.querySelector('[id^="react-container"]')?.textContent ?? '';
      return text.includes(needle);
    },
    expected,
    { timeout: 5000 },
  );
}

/** Describes the focused element, so a test can assert it did not change. */
async function activeElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    return el ? `${el.tagName}#${el.id}` : 'none';
  });
}

/** Names of the tools the page registered. */
async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys((window as any).__tools ?? {}).sort());
}

/** Calls a registered tool as an agent would. */
async function callTool(page: Page, name: string, input: unknown): Promise<ToolResult> {
  return page.evaluate(
    ([toolName, toolInput]) => (window as any).__tools[toolName as string].execute(toolInput, {}),
    [name, input] as const,
  );
}

/**
 * Installs the stand-in model context, and the page's meta tag when asked.
 * @param page - The Playwright page
 * @param meta - The tag's `content`, or null for no tag
 */
async function setUp(page: Page, meta: 'on' | 'off' | null): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool(tool: { name: string }, options?: { signal?: AbortSignal }) {
          const tools = ((window as any).__tools ||= {});
          tools[tool.name] = tool;
          options?.signal?.addEventListener('abort', () => delete tools[tool.name]);
          return Promise.resolve();
        },
      },
    });
  });
  if (meta !== null) {
    await page.addInitScript((content) => {
      document.addEventListener('DOMContentLoaded', () => {
        const tag = document.createElement('meta');
        tag.name = 'maidr-webmcp';
        tag.content = content;
        document.head.append(tag);
      });
    }, meta);
  }
}

/** Every tool MAIDR registers, by name. */
const ALL_TOOLS = [
  'maidr_get_layer_data',
  'maidr_list_charts',
  'maidr_list_commands',
  'maidr_navigate',
  'maidr_run_command',
];

/** Opens the bar chart and waits for its tools. */
async function openChart(page: Page): Promise<void> {
  await page.goto('examples/barplot.html');
  await page.waitForSelector('svg#bar');
  await page.waitForFunction(count => Object.keys((window as any).__tools ?? {}).length === count, ALL_TOOLS.length);
}

test.describe('WebMCP tools', () => {
  test('registers five tools by default and lists the chart under content', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);

    expect(await toolNames(page)).toEqual(ALL_TOOLS);

    const result = await callTool(page, 'maidr_list_charts', {});
    expect(result.ok).toBe(true);
    const charts = result.content?.charts as Array<Record<string, unknown>>;
    expect(charts).toHaveLength(1);
    expect(charts[0].chartId).toBe('bar');
    expect(charts[0].title).toBe('The Number of Tips by Day');
    expect(charts[0].reader).toEqual({ inChart: false, position: null });
  });

  test('waits for the reader when they are not in the chart, and moves no focus without being asked', async ({ page }) => {
    await setUp(page, 'on');
    await openChart(page);
    const focusBefore = await activeElement(page);
    const textBefore = await ariaText(page);

    const result = await callTool(page, 'maidr_navigate', { layerId: '0', row: 0, col: 2 });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe('on-next-focus');
    await page.waitForTimeout(600); // settle: silence cannot be polled
    expect(await activeElement(page)).toBe(focusBefore);
    expect(await ariaText(page)).toBe(textBefore);

    await page.keyboard.press('Tab');
    await waitForAriaText(page, 'Thursday');
    expect(await ariaText(page)).toContain('62');
  });

  test('moves and announces at once when the reader is in the chart', async ({ page }) => {
    await setUp(page, 'on');
    await openChart(page);
    await page.click('#bar');
    await waitForAriaText(page, 'maidr plot'); // focus-in shows the instruction
    await page.keyboard.press('ArrowRight');
    await waitForAriaText(page, 'Saturday');
    const focusBefore = await activeElement(page);

    const listed = await callTool(page, 'maidr_list_charts', {});
    const reader = (listed.content?.charts as Array<{ reader: { inChart: boolean; position: string } }>)[0].reader;
    expect(reader.inChart).toBe(true);
    expect(reader.position).toContain('Saturday');

    // The agent addresses the point by the target the data came with.
    const data = await callTool(page, 'maidr_get_layer_data', { layerId: '0' });
    const thursday = (data.content?.points as Array<{ point: { x: string }; target: Record<string, number> }>)
      .find(entry => entry.point.x === 'Thur');
    expect(thursday?.target).toEqual({ row: 0, col: 2 });

    const result = await callTool(page, 'maidr_navigate', { chartId: 'bar', layerId: '0', ...thursday?.target });

    expect(result).toEqual({ ok: true, applied: 'now' });
    await waitForAriaText(page, 'Thursday');
    expect(await activeElement(page)).toBe(focusBefore);
  });

  test('lists the reader\'s commands with their keys and modes, without a sound', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    const textBefore = await ariaText(page);

    const result = await callTool(page, 'maidr_list_commands', {});

    expect(result.ok).toBe(true);
    const commands = result.commands as Array<Record<string, unknown>>;
    expect(commands.find(entry => entry.command === 'toggle_braille')).toEqual({
      command: 'toggle_braille',
      title: 'Toggle Braille Mode',
      keys: 'b',
      runnable: true,
    });
    expect(commands.find(entry => entry.command === 'open_settings')).toMatchObject({ runnable: false });
    expect(result.modes).toEqual({
      text: 'verbose',
      sound: true,
      braille: false,
      highContrast: false,
      monitor: false,
      autoplay: false,
      navigationMode: 'data',
    });
    expect(result.reader).toEqual({ inChart: false, blocked: false });
    expect(result.pending).toBe(0);
    // Nothing the page wrote: neither the chart's id nor its title.
    expect(JSON.stringify(result)).not.toContain('"bar"');
    expect(JSON.stringify(result)).not.toContain('Tips');
    expect(await ariaText(page)).toBe(textBefore);
  });

  test('keeps commands for a reader who is away, and announces each one when they come in', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    const focusBefore = await activeElement(page);
    const textBefore = await ariaText(page);

    const result = await callTool(page, 'maidr_run_command', { command: 'toggle_text' });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe('on-next-focus');
    expect((await callTool(page, 'maidr_run_command', { command: 'toggle_sound' })).applied).toBe('on-next-focus');
    await page.waitForTimeout(600); // settle: silence cannot be polled
    expect(await activeElement(page)).toBe(focusBefore);
    expect(await ariaText(page)).toBe(textBefore);
    expect((await callTool(page, 'maidr_list_commands', {})).pending).toBe(2);

    await page.keyboard.press('Tab');
    // Each on its own, the first not overwritten by the second.
    await waitForAriaText(page, 'Text mode is terse');
    await waitForAriaText(page, 'Sound is off');
    const listed = await callTool(page, 'maidr_list_commands', {});
    expect(listed.pending).toBe(0);
    expect(listed.modes as Record<string, unknown>).toMatchObject({ text: 'terse', sound: false });
  });

  test('runs a command at once when the reader is in the chart', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    await page.click('#bar');
    await waitForAriaText(page, 'maidr plot');
    await page.keyboard.press('ArrowRight');
    await waitForAriaText(page, 'Saturday');
    const focusBefore = await activeElement(page);

    const result = await callTool(page, 'maidr_run_command', { chartId: 'bar', command: 'toggle_sound' });

    expect(result.ok).toBe(true);
    expect(result.applied).toBe('now');
    expect((result.modes as Record<string, unknown>).sound).toBe(false);
    await waitForAriaText(page, 'Sound is off');
    expect(await activeElement(page)).toBe(focusBefore);

    // The reader's next arrow key works as before.
    await page.keyboard.press('ArrowRight');
    await waitForAriaText(page, 'Sunday');
  });

  /**
   * Puts a button before the chart and the reader's focus on it, as if they
   * had been working with the page around the chart rather than in it.
   * @param page - The Playwright page
   */
  async function focusButtonBesideChart(page: Page): Promise<void> {
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'elsewhere';
      button.textContent = 'Elsewhere';
      document.body.prepend(button);
      button.focus();
    });
    expect(await activeElement(page)).toBe('BUTTON#elsewhere');
  }

  /** Whether the reader's keyboard focus is inside the chart's figure. */
  async function focusIsInChart(page: Page): Promise<boolean> {
    return page.evaluate(() => document.getElementById('maidr-figure-bar')?.contains(document.activeElement) === true);
  }

  test('takes the reader into the chart and announces the move when the agent passes focus', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    await focusButtonBesideChart(page);

    const result = await callTool(page, 'maidr_navigate', { layerId: '0', row: 0, col: 2, focus: true });

    expect(result).toEqual({ ok: true, applied: 'now', focused: true });
    expect(await focusIsInChart(page)).toBe(true);
    await waitForAriaText(page, 'Thursday');
    expect(await ariaText(page)).toContain('62');
    const listed = await callTool(page, 'maidr_list_charts', {});
    const reader = (listed.content?.charts as Array<{ reader: { inChart: boolean; position: string } }>)[0].reader;
    expect(reader.inChart).toBe(true);
    expect(reader.position).toContain('Thursday');

    // From there on, the reader's own keys carry on from the point.
    await page.keyboard.press('ArrowRight');
    await waitForAriaText(page, 'Friday');
  });

  test('takes the reader into the chart and then runs the command when the agent passes focus', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    await focusButtonBesideChart(page);

    const result = await callTool(page, 'maidr_run_command', { command: 'toggle_text', focus: true });

    expect(result).toMatchObject({ ok: true, applied: 'queued', focused: true });
    expect(result.message).toContain('waits its turn');
    expect(result.modes).toBeUndefined();
    expect(await focusIsInChart(page)).toBe(true);
    await waitForAriaText(page, 'Text mode is terse');
    const listed = await callTool(page, 'maidr_list_commands', {});
    expect(listed.pending).toBe(0);
    expect(listed.reader).toEqual({ inChart: true, blocked: false });
    expect(listed.modes as Record<string, unknown>).toMatchObject({ text: 'terse' });
  });

  test('keeps the move, and moves and announces nothing, when the page does not have the browser\'s focus', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    await focusButtonBesideChart(page);
    // As while the reader talks to the agent in a browser side panel.
    await page.evaluate(() => {
      (window as any).__hasFocus = Document.prototype.hasFocus;
      Document.prototype.hasFocus = () => false;
    });
    const textBefore = await ariaText(page);

    const result = await callTool(page, 'maidr_navigate', { layerId: '0', row: 0, col: 2, focus: true });

    expect(result).toMatchObject({ ok: true, applied: 'on-next-focus', focused: false });
    expect(result.message).toContain('could not be moved');
    await page.waitForTimeout(600); // settle: silence cannot be polled
    expect(await ariaText(page)).toBe(textBefore);
    const listed = await callTool(page, 'maidr_list_charts', {});
    expect((listed.content?.charts as Array<{ reader: unknown }>)[0].reader).toEqual({ inChart: false, position: null });

    // Back on the page, where they left it -- the page's own focus did not
    // move either -- they Tab into the chart and land on the point.
    await page.evaluate(() => {
      Document.prototype.hasFocus = (window as any).__hasFocus;
    });
    expect(await activeElement(page)).toBe('BUTTON#elsewhere');
    await page.keyboard.press('Tab');
    await waitForAriaText(page, 'Thursday');
  });

  test.describe('in a chat host\'s frame', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    let server: http.Server;
    let port: number;
    /** The call the view picks up on its next poll, as a relay hands it one. */
    let pendingCall: RelayCall | null = null;
    /** Hands the view's answer to the call waiting for it. */
    let answer: ((result: ToolResult) => void) | null = null;

    // Serves the repository over HTTP, so a host page on one origin
    // (localhost) can frame the chart from another (127.0.0.1), as a chat
    // host frames an MCP App's view, and relays tool calls to the view.
    test.beforeAll(async () => {
      server = http.createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname === '/host') {
          response.setHeader('content-type', 'text/html');
          response.end(`<!doctype html><title>Host</title>
            <script>addEventListener('message', (event) => { if (event.data === 'view-ready') window.__viewReady = true; });</script>
            <input id="composer" aria-label="Message">
            <iframe id="view" title="Chart" width="900" height="700" src="http://127.0.0.1:${port}/examples/barplot.html"></iframe>`);
          return;
        }
        if (url.pathname === '/relay/next') {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(pendingCall));
          pendingCall = null;
          return;
        }
        if (url.pathname === '/relay/result') {
          let body = '';
          request.on('data', (chunk) => {
            body += chunk;
          });
          request.on('end', () => {
            answer?.(JSON.parse(body) as ToolResult);
            response.end();
          });
          return;
        }
        const file = path.join(repoRoot, path.normalize(url.pathname));
        if (!file.startsWith(repoRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
        response.end(fs.readFileSync(file));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as AddressInfo).port;
    });

    test.afterAll(async () => {
      await new Promise(resolve => server.close(resolve));
    });

    /**
     * Calls a tool in the chart's frame the way maidr-mcp's view receives a
     * call: the view polls the relay and runs what it gets. Nothing the
     * reader did starts it, so the frame has no user activation for it --
     * which Playwright's own `frame.evaluate` would give it.
     * @param call - The tool, its input, and whether the browser should keep
     *   its focus from the frame, as from the side panel
     * @returns The tool's result
     */
    function relay(call: RelayCall): Promise<ToolResult> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('the view never answered')), 10_000);
        answer = (result) => {
          clearTimeout(timer);
          answer = null;
          resolve(result);
        };
        pendingCall = call;
      });
    }

    /**
     * Opens the host with the reader typing in its composer, outside the
     * chart's frame, and waits for the frame's tools.
     * @param page - The Playwright page
     * @returns The chart's frame
     */
    async function openHost(page: Page): Promise<Frame> {
      await setUp(page, null);
      await page.addInitScript((count) => {
        if (window.parent === window) {
          return;
        }
        const poll = async (): Promise<void> => {
          try {
            const tools = (window as any).__tools ?? {};
            if (Object.keys(tools).length === count) {
              if (!(window as any).__ready) {
                (window as any).__ready = true;
                window.parent.postMessage('view-ready', '*');
              }
              const call = await (await fetch('/relay/next', { cache: 'no-store' })).json();
              if (call !== null) {
                if (call.noBrowserFocus) {
                  Document.prototype.hasFocus = () => false;
                }
                const result = await tools[call.name].execute(call.input, {});
                await fetch('/relay/result', { method: 'POST', body: JSON.stringify(result) });
              }
            }
          } finally {
            setTimeout(poll, 100);
          }
        };
        void poll();
      }, ALL_TOOLS.length);
      await page.goto(`http://localhost:${port}/host`);
      await page.waitForFunction(() => (window as any).__viewReady === true);
      const frame = page.frame({ url: /127\.0\.0\.1.*barplot/ });
      if (frame === null) {
        throw new Error('no chart frame');
      }
      await page.click('#composer');
      expect(await activeElement(page)).toBe('INPUT#composer');
      return frame;
    }

    /** Whether the frame's own focus is inside the chart's figure. */
    async function frameFocusIsInChart(frame: Frame): Promise<boolean> {
      return frame.evaluate(() => document.getElementById('maidr-figure-bar')?.contains(document.activeElement) === true);
    }

    test('takes the reader from the host into the chart where the browser lets a frame take focus, and keeps the move where not', async ({ page, browserName }) => {
      const frame = await openHost(page);

      const result = await relay({ name: 'maidr_navigate', input: { layerId: '0', row: 0, col: 2, focus: true } });

      if (browserName === 'webkit') {
        // WebKit keeps a frame from taking focus without the reader's own
        // click or key: the composer keeps it, and the move waits.
        expect(result).toMatchObject({ ok: true, applied: 'on-next-focus', focused: false });
        expect(result.message).toContain('another page\'s frame');
        expect(await activeElement(page)).toBe('INPUT#composer');
        expect(await frameFocusIsInChart(frame)).toBe(false);
        // The reader Tabs from the composer into the chart.
        await page.keyboard.press('Tab');
      } else {
        expect(result).toEqual({ ok: true, applied: 'now', focused: true });
        expect(await frameFocusIsInChart(frame)).toBe(true);
      }
      await frame.waitForFunction(
        () => (document.querySelector('[id^="react-container"]')?.textContent ?? '').includes('Thursday'),
        undefined,
        { timeout: 5000 },
      );
    });

    test('puts the frame\'s own focus back where it was when the browser does not give the frame its focus', async ({ page }) => {
      const frame = await openHost(page);

      const result = await relay({ name: 'maidr_navigate', input: { layerId: '0', row: 0, col: 2, focus: true }, noBrowserFocus: true });

      expect(result).toMatchObject({ ok: true, applied: 'on-next-focus', focused: false });
      expect(await frame.evaluate(() => document.activeElement === document.body)).toBe(true);
      const listed = await relay({ name: 'maidr_list_charts', input: {} });
      expect((listed.content?.charts as Array<{ reader: unknown }>)[0].reader).toEqual({ inChart: false, position: null });
    });
  });

  test('registers nothing and logs no errors when the page switches them off', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });
    page.on('pageerror', error => errors.push(error.message));
    await setUp(page, 'off');

    await page.goto('examples/barplot.html');
    await page.waitForSelector('svg#bar');
    await page.click('#bar');
    await waitForAriaText(page, 'maidr plot');

    expect(await toolNames(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the reader turns the tools off and on in Settings without a reload', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);
    const barPlotPage = new BarPlotPage(page);
    await barPlotPage.activateMaidr();

    const toggle = async (): Promise<void> => {
      await barPlotPage.openSettingsMenu();
      const checkbox = page.getByRole('checkbox', { name: 'Browser AI Agent Access' });
      await expect(checkbox).toHaveAccessibleDescription(/AI assistant built into your browser/);
      await checkbox.click();
      await page.getByRole('button', { name: 'Save & Close Settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
    };

    await toggle();
    await page.waitForFunction(() => Object.keys((window as any).__tools ?? {}).length === 0);
    await expect(page.locator('svg#bar')).toBeVisible();

    await toggle();
    await page.waitForFunction(count => Object.keys((window as any).__tools ?? {}).length === count, ALL_TOOLS.length);
    expect(await toolNames(page)).toEqual(ALL_TOOLS);
  });
  /**
   * Puts a second bar chart (id "bar2") beside the first, before MAIDR mounts,
   * so each has its own settings dialog. Both are declared through the
   * `maidr` attribute, since the page's `var maidr` fallback serves one chart.
   * @param page - The Playwright page
   * @param blockStorage - Whether saving settings fails, as in a private window
   */
  async function openTwoCharts(page: Page, blockStorage: boolean): Promise<void> {
    await page.addInitScript((block) => {
      if (block) {
        Storage.prototype.setItem = () => {
          throw new DOMException('blocked', 'SecurityError');
        };
      }
      document.addEventListener('DOMContentLoaded', () => {
        const first = document.querySelector('svg#bar')!;
        const data = (window as any).maidr;
        const second = first.cloneNode(true) as SVGSVGElement;
        second.id = 'bar2';
        first.setAttribute('maidr', JSON.stringify(data));
        second.setAttribute('maidr', JSON.stringify({ ...data, id: 'bar2' }));
        first.after(second);
      });
    }, blockStorage);
    await page.goto('examples/barplot.html');
    await page.waitForSelector('svg#bar2');
    await page.waitForFunction(count => Object.keys((window as any).__tools ?? {}).length === count, ALL_TOOLS.length);
  }

  /**
   * Reads one chart's aria text region, when the page has several.
   * @param page - The Playwright page
   * @param id - The chart's id
   */
  async function chartText(page: Page, id: string): Promise<string> {
    return page.evaluate(
      chartId => document.getElementById(`react-container-${chartId}`)?.textContent ?? '',
      id,
    );
  }

  for (const setBy of ['agent', 'page'] as const) {
    const fate = setBy === 'agent' ? 'drops' : 'keeps';
    test(`switching the tools off ${fate} a move the ${setBy} left waiting in another chart`, async ({ page }) => {
      await setUp(page, null);
      await openTwoCharts(page, false);
      const barPlotPage = new BarPlotPage(page);

      // The reader is in the first chart; the second is pointed at Thursday.
      await page.click('svg#bar');
      if (setBy === 'agent') {
        const kept = await callTool(page, 'maidr_navigate', { chartId: 'bar2', layerId: '0', row: 0, col: 2 });
        expect(kept.applied).toBe('on-next-focus');
      } else {
        expect(await page.evaluate(() => (window as any).maidrLive.navigateTo(
          { layerId: '0', row: 0, col: 2 },
          { id: 'bar2' },
        ))).toBe(true);
      }

      await barPlotPage.openSettingsMenu();
      await page.getByRole('checkbox', { name: 'Browser AI Agent Access' }).click();
      await page.getByRole('button', { name: 'Save & Close Settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden();
      await page.waitForFunction(() => Object.keys((window as any).__tools ?? {}).length === 0);

      await page.click('svg#bar2');
      await expect.poll(() => chartText(page, 'bar2')).not.toBe('');
      if (setBy === 'agent') {
        await page.waitForTimeout(600); // settle: silence cannot be polled
        expect(await chartText(page, 'bar2')).not.toContain('Thursday');
      } else {
        await expect.poll(() => chartText(page, 'bar2')).toContain('Thursday');
      }
    });
  }

  for (const blockStorage of [false, true]) {
    test(`another chart's Settings shows a choice made in the first${blockStorage ? ' when storage is blocked' : ''}`, async ({ page }) => {
      await setUp(page, null);
      await openTwoCharts(page, blockStorage);
      const barPlotPage = new BarPlotPage(page);
      const checkbox = page.getByRole('checkbox', { name: 'Browser AI Agent Access' });
      const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });

      await page.click('svg#bar');
      await barPlotPage.openSettingsMenu();
      await expect(checkbox).toBeChecked();
      await checkbox.click();
      await page.getByRole('button', { name: 'Save & Close Settings' }).click();
      await expect(dialog).toBeHidden();
      await page.waitForFunction(() => Object.keys((window as any).__tools ?? {}).length === 0);

      await page.click('svg#bar2');
      await barPlotPage.openSettingsMenu();
      await expect(checkbox).not.toBeChecked();
    });
  }
});
