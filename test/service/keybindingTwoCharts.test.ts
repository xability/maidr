/**
 * @jest-environment jsdom
 */
import type { CommandContext } from '@command/command';
import type { BrailleViewModel } from '@state/viewModel/brailleViewModel';
import type { TextViewModel } from '@state/viewModel/textViewModel';
import type { Settings } from '@type/settings';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { KeybindingService } from '@service/keybinding';
import { Scope } from '@type/event';
import { DEFAULT_SETTINGS } from '@type/settings';
import hotkeys from 'hotkeys-js';

/**
 * Two charts on one page share one hotkeys-js: one handler table and one
 * active scope, under the same scope names. Whichever chart the reader
 * entered last is the one whose keys act and whose scope is in force, and
 * leaving, disposing or rebinding the other takes neither with it.
 *
 * Driven through the real hotkeys-js, since the shared table is the point.
 */

const KEY_CODE = {
  t: 84,
  x: 88,
} as const;

interface Chart {
  service: KeybindingService;
  notify: jest.Mock<(message: string) => void>;
  toggleText: jest.Mock<() => void>;
}

let charts: Chart[] = [];

/**
 * A chart's keybinding service, with the collaborators the exercised
 * commands reach.
 * @returns The chart
 */
function createChart(): Chart {
  const notify = jest.fn<(message: string) => void>();
  const toggleText = jest.fn<() => void>();

  const commandContext = {
    notificationService: { notify },
    audioService: { playWarningToneIfEnabled: jest.fn() },
    textViewModel: { toggle: toggleText } as unknown as TextViewModel,
    brailleViewModel: { toggle: jest.fn() } as unknown as BrailleViewModel,
  } as unknown as CommandContext;

  const chart = { service: new KeybindingService(commandContext), notify, toggleText };
  charts.push(chart);
  return chart;
}

/**
 * Presses and releases a key, and lets the deferred unassigned-key check run.
 * Released, or hotkeys-js reads the next key as a chord with this one.
 * @param keyCode - The key's legacy code, which is what hotkeys-js reads
 */
async function press(keyCode: number): Promise<void> {
  document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, keyCode }));
  document.body.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, keyCode }));
  await Promise.resolve();
}

/**
 * Settings carrying only the given overrides.
 * @param keybindings - The reader's shortcuts, by command
 * @returns The settings
 */
function settingsWith(keybindings: Record<string, string>): Settings {
  return { ...DEFAULT_SETTINGS, general: { ...DEFAULT_SETTINGS.general, keybindings } };
}

afterEach(() => {
  charts.forEach(chart => chart.service.unregister());
  charts = [];
});

describe('keybindings of two charts on one page', () => {
  it('should keep the other chart\'s keys when one is disposed', async () => {
    const left = createChart();
    const entered = createChart();
    left.service.register(Scope.TRACE);
    entered.service.register(Scope.TRACE);

    left.service.unregister();
    await press(KEY_CODE.t);

    expect(entered.toggleText).toHaveBeenCalledTimes(1);
    expect(left.toggleText).not.toHaveBeenCalled();
    expect(hotkeys.getScope()).toBe(Scope.TRACE);
  });

  it('should act only in the chart entered last while both are bound', async () => {
    const left = createChart();
    const entered = createChart();
    left.service.register(Scope.TRACE);
    entered.service.register(Scope.TRACE);

    await press(KEY_CODE.t);
    await press(KEY_CODE.x);

    expect(entered.toggleText).toHaveBeenCalledTimes(1);
    expect(left.toggleText).not.toHaveBeenCalled();
    // An unassigned key warns once, from the chart the reader is in.
    expect(entered.notify).toHaveBeenCalledTimes(1);
    expect(left.notify).not.toHaveBeenCalled();
  });

  it('should keep the other chart\'s scope and keys when a chart the reader left is rebound', async () => {
    const left = createChart();
    const entered = createChart();
    left.service.register(Scope.TRACE);
    entered.service.register(Scope.BRAILLE);

    left.service.update(settingsWith({ TOGGLE_TEXT: 'x' }));
    await press(KEY_CODE.t);

    expect(hotkeys.getScope()).toBe(Scope.BRAILLE);
    expect(entered.toggleText).toHaveBeenCalledTimes(1);
    expect(left.toggleText).not.toHaveBeenCalled();
  });

  it('should not let a chart the reader left move the scope', () => {
    const left = createChart();
    const entered = createChart();
    left.service.register(Scope.TRACE);
    entered.service.register(Scope.BRAILLE);

    left.service.setScope(Scope.SUBPLOT);

    expect(hotkeys.getScope()).toBe(Scope.BRAILLE);
  });

  it('should leave nothing bound, and the scope at all, once the last chart goes', () => {
    const baseline = hotkeys.getAllKeyCodes().length;
    const entered = createChart();
    entered.service.register(Scope.TRACE);
    entered.service.update(settingsWith({ TOGGLE_BRAILLE: 'shift+b' }));
    const enteredOwn = hotkeys.getAllKeyCodes().length - baseline;
    const left = createChart();
    // Every shape a keymap binds -- `*`, the `,` key, comma lists, a bare
    // `ctrl`, a chord -- has to come back off by the handler it was bound with.
    left.service.register(Scope.TRACE, { TOGGLE_TEXT: 'ctrl+shift+x' });

    left.service.unregister();
    const afterLeft = hotkeys.getAllKeyCodes().length;
    entered.service.unregister();

    expect(afterLeft).toBe(baseline + enteredOwn);
    expect(hotkeys.getAllKeyCodes()).toHaveLength(baseline);
    expect(hotkeys.getScope()).toBe('all');
  });

  it('should keep the scope of the chart the reader is in when it is rebound', async () => {
    const left = createChart();
    const entered = createChart();
    left.service.register(Scope.TRACE);
    entered.service.register(Scope.BRAILLE);

    entered.service.update(settingsWith({ TOGGLE_TEXT: 'x' }));
    await press(KEY_CODE.x);

    expect(hotkeys.getScope()).toBe(Scope.BRAILLE);
    expect(entered.toggleText).toHaveBeenCalledTimes(1);
    expect(left.toggleText).not.toHaveBeenCalled();
  });
});
