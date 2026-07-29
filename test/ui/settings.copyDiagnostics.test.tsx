/**
 * @jest-environment jsdom
 */

/**
 * Component test for the About section's "Copy diagnostics" control.
 *
 * The pure pieces underneath are already covered — `formatDiagnostics` in
 * test/util/diagnostics.test.ts, the clipboard write and its execCommand
 * fallback in test/util/clipboard.test.ts. What nothing covered is the wiring
 * between them and the accessibility contract the button carries: that the
 * live region is in the DOM before the first copy, that the button's
 * description resolves to it, and that a *repeat* copy still mutates it.
 *
 * That last one is not a detail. A live region announces on the DOM mutation,
 * not on the state update, so a status that re-renders to identical text is
 * silent to a screen reader from the second copy onward — the bug found by
 * hand on #654, and the reason `CopyState` carries an attempt counter.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Settings from '@ui/component/Settings';
import { MAIDR_VERSION } from '@util/version';
// The `/jest-globals` entry point, not the bare one: it augments the `expect`
// imported from @jest/globals rather than the ambient global.
import '@testing-library/jest-dom/jest-globals';

const COPY_BUTTON_NAME = 'Copy diagnostics to clipboard';
const COPIED_MESSAGE = 'Copied to clipboard';
const FAILED_MESSAGE = 'Could not copy — select the values above and copy them manually';

const writeText = jest.fn<(text: string) => Promise<void>>();
// Both clipboard paths log on failure by design. Silenced for the file rather
// than per test, so the expected-failure cases do not print noise, and handed
// back in afterAll.
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

/**
 * Renders the settings dialog with stub view models.
 *
 * The registry is the production one — it is a plain map — so the component
 * reaches its view models through the same `useViewModel` path it uses at
 * runtime, with only the leaves stubbed.
 *
 * A static `state` is enough here because `Settings` reads it once per render
 * through the view model's getter. A component that subscribes with
 * `useViewModelState` reads the Redux slice instead, and a stub like this one
 * would never re-render it — that case needs a store and a `Provider`.
 */
function renderSettings(): void {
  const registry = new ViewModelRegistry();
  registry.register('settings', {
    state: DEFAULT_SETTINGS,
    load: jest.fn(),
    reset: jest.fn(),
    toggle: jest.fn(),
    saveAndClose: jest.fn(),
  } as unknown as SettingsViewModel);
  registry.register('chat', {
    updateWelcomeMessage: jest.fn(),
  } as unknown as ChatViewModel);

  render(
    <MaidrContext.Provider
      value={{
        viewModelRegistry: registry,
        commandExecutor: {} as unknown as CommandExecutor,
      }}
    >
      <Settings />
    </MaidrContext.Provider>,
  );
}

/**
 * Finds the copy button.
 * @returns The About section's copy button.
 */
function copyButton(): HTMLElement {
  return screen.getByRole('button', { name: COPY_BUTTON_NAME });
}

/**
 * Resolves the element a control's accessible description points at.
 *
 * Looked up the way assistive technology resolves it — through
 * `aria-describedby` — rather than through a test hook, so a dangling
 * reference fails here instead of passing against an element nothing points
 * to. The dialog renders several `role="status"` regions (one per LLM
 * credential field), which is why a role query alone will not do.
 * @param element - The control whose description to resolve.
 * @returns The referenced element.
 */
function describedBy(element: HTMLElement): HTMLElement {
  const id = element.getAttribute('aria-describedby');
  expect(id).toBeTruthy();

  const region = document.getElementById(id as string);
  expect(region).not.toBeNull();

  return region as HTMLElement;
}

/**
 * Clicks an element and lets the click handler's promise settle.
 *
 * The handler is async, so the state update behind the status region lands in
 * a microtask after the event itself returns.
 * @param element - The element to click.
 */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

beforeEach(() => {
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  // jsdom implements neither clipboard path. Both are stubbed so a test that
  // exercises the fallback lands on its own rejection branch rather than on a
  // missing-API TypeError.
  Object.defineProperty(globalThis.document, 'execCommand', {
    value: jest.fn(() => false),
    configurable: true,
  });
  consoleWarn.mockClear();
  consoleError.mockClear();
});

afterAll(() => {
  consoleWarn.mockRestore();
  consoleError.mockRestore();
});

describe('settings About section: copy diagnostics', () => {
  it('should render the status region before any copy so the first update is announced', () => {
    renderSettings();

    const status = describedBy(copyButton());

    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.textContent).toBe('');
  });

  it('should keep the visible label inside the accessible name', () => {
    renderSettings();

    const button = copyButton();

    expect(button).toHaveTextContent('Copy diagnostics');
    expect(button.getAttribute('aria-label')).toContain('Copy diagnostics');
  });

  it('should copy the formatted diagnostics and report success', async () => {
    renderSettings();
    const button = copyButton();

    await click(button);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('MAIDR diagnostics');
    expect(writeText.mock.calls[0][0]).toContain(`maidr.js version: ${MAIDR_VERSION}`);
    expect(describedBy(button)).toHaveTextContent(COPIED_MESSAGE);
  });

  it('should mutate the status region on a repeat copy', async () => {
    renderSettings();
    const button = copyButton();
    const status = describedBy(button);
    await click(button);

    // Observes what a screen reader observes: the region's subtree changing.
    // Asserting on the text alone would pass even when nothing moved, which
    // is precisely the regression — the second copy announced nothing.
    //
    // Records are read from both ends so the assertion does not depend on when
    // the queue drains: awaiting the click passes a microtask checkpoint, which
    // hands delivered records to the callback, and `takeRecords` picks up
    // anything still queued behind it.
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(status, { childList: true, subtree: true, characterData: true });
    await click(button);
    mutations.push(...observer.takeRecords());
    observer.disconnect();

    expect(writeText).toHaveBeenCalledTimes(2);
    expect(mutations.length).toBeGreaterThan(0);
    expect(status).toHaveTextContent(COPIED_MESSAGE);
  });

  it('should report a failure the user can act on when both clipboard paths fail', async () => {
    writeText.mockRejectedValue(new Error('clipboard write denied'));
    renderSettings();
    const button = copyButton();

    await click(button);

    expect(describedBy(button)).toHaveTextContent(FAILED_MESSAGE);
  });

  it('should leave focus on the copy button when the fallback path runs', async () => {
    writeText.mockRejectedValue(new Error('clipboard write denied'));
    renderSettings();
    const button = copyButton();
    button.focus();

    await click(button);

    // The fallback selects a throwaway textarea, so anything it takes it has
    // to give back — otherwise a keyboard or screen reader user is dropped to
    // the document body and loses their place in the dialog.
    expect(document.activeElement).toBe(button);
  });

  it('should expose the dialog and its controls to the accessibility tree', () => {
    renderSettings();

    // Guards #655, fixed in #659: the dialogs render with `disablePortal`, and
    // MUI used to hide an ancestor of them, taking the dialog and every live
    // region inside it out of the accessibility tree while it was open.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY_BUTTON_NAME })).toBeInTheDocument();
    expect(describedBy(copyButton())).toBeInTheDocument();
  });

  /**
   * Pins the accessible name gap that #659 uncovered: the settings dialog has
   * none. `aria-label="Settings"` is passed to `<Dialog>`, which spreads it
   * onto the modal root — a `role="presentation"` element, where it names
   * nothing — while the `role="dialog"` paper carries the `aria-labelledby`
   * MUI generates for a `DialogTitle` this dialog never renders, so the
   * reference dangles. A screen reader announces the dialog with no name.
   *
   * Invisible until now because the whole dialog sat outside the accessibility
   * tree. Marked `failing` rather than skipped so it stays executed: naming the
   * dialog turns this red, which is the signal to drop the marker.
   */
  it.failing('should give the dialog an accessible name (#663)', () => {
    renderSettings();

    // Any non-empty name, not the literal "Settings": the contract is that the
    // dialog is named at all, and pinning the exact string would keep this red
    // — indistinguishably from still-unnamed — if the fix lands on wording
    // this test did not predict.
    //
    // `queryByRole`, not `getByRole`: the getter's not-found error renders the
    // whole dialog into the failure message, and this case is expected to miss
    // on every run until the dialog is named.
    expect(screen.queryByRole('dialog', { name: /\S/ })).toBeInTheDocument();
  });
});
