import type { Page } from '@playwright/test';
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

/** Opens the bar chart and waits for its tools. */
async function openChart(page: Page): Promise<void> {
  await page.goto('examples/barplot.html');
  await page.waitForSelector('svg#bar');
  await page.waitForFunction(() => Object.keys((window as any).__tools ?? {}).length === 3);
}

test.describe('WebMCP tools', () => {
  test('registers three tools by default and lists the chart under content', async ({ page }) => {
    await setUp(page, null);
    await openChart(page);

    expect(await toolNames(page)).toEqual(['maidr_get_layer_data', 'maidr_list_charts', 'maidr_navigate']);

    const result = await callTool(page, 'maidr_list_charts', {});
    expect(result.ok).toBe(true);
    const charts = result.content?.charts as Array<Record<string, unknown>>;
    expect(charts).toHaveLength(1);
    expect(charts[0].chartId).toBe('bar');
    expect(charts[0].title).toBe('The Number of Tips by Day');
    expect(charts[0].reader).toEqual({ inChart: false, position: null });
  });

  test('waits for the reader when they are not in the chart, and never moves focus', async ({ page }) => {
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
    await page.waitForFunction(() => Object.keys((window as any).__tools ?? {}).length === 3);
    expect(await toolNames(page)).toEqual(['maidr_get_layer_data', 'maidr_list_charts', 'maidr_navigate']);
  });
});
