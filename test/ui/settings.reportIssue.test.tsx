/**
 * @jest-environment jsdom
 */

/**
 * Component test for the About section's "Report an issue" control.
 *
 * What the link carries is covered under `buildIssueUrl` in
 * test/util/diagnostics.test.ts. What only a render can show is the part a
 * reader meets: that this is a *link* and not a button dressed as one, that
 * its accessible name says where it goes and that it leaves the tab, and that
 * the prefill is described rather than left to be discovered on GitHub's form.
 *
 * The href is checked against the same builder the component calls rather than
 * against a literal, so a change to the report's shape belongs in one place —
 * this file only holds the wiring to it.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '@type/settings';
import Settings from '@ui/component/Settings';
import { buildIssueUrl, collectDiagnostics } from '@util/diagnostics';
// The `/jest-globals` entry point, not the bare one: it augments the `expect`
// imported from @jest/globals rather than the ambient global.
import '@testing-library/jest-dom/jest-globals';

const LINK_NAME = 'Open a bug report on GitHub in a new tab';
const VISIBLE_LABEL = 'Open a bug report';

/** The `SettingsViewModel` surface `Settings` actually calls. */
type SettingsStub = Pick<
  SettingsViewModel,
  | 'state'
  | 'load'
  | 'reset'
  | 'toggle'
  | 'saveAndClose'
  | 'tactileDisplayState'
  | 'onTactileDisplayStateChange'
  | 'supportsTactileTransport'
  | 'connectTactileDisplay'
  | 'disconnectTactileDisplay'
  | 'preloadTactileDisplay'
>;

/** The `ChatViewModel` surface `Settings` actually calls. */
type ChatStub = Pick<ChatViewModel, 'updateWelcomeMessage'>;

/**
 * Renders the settings dialog on its About tab with stub view models.
 *
 * Typed as a `Pick` of the real view models rather than cast from an object
 * literal, so the members the stub defines are checked against the production
 * signatures instead of drifting behind an `as unknown as`.
 */
function renderSettings(): void {
  const settings: SettingsStub = {
    state: DEFAULT_SETTINGS,
    load: jest.fn(),
    reset: jest.fn(),
    toggle: jest.fn(),
    saveAndClose: jest.fn(),
    // The tactile-display picker sits in the same dialog. Nothing here
    // exercises it, but the component reads its state on every render and
    // subscribes on mount, so the stub has to answer both.
    tactileDisplayState: {
      status: 'disconnected',
      deviceName: null,
      transport: null,
      geometry: null,
      message: '',
    },
    onTactileDisplayStateChange: jest.fn(() => ({ dispose: jest.fn() })),
    supportsTactileTransport: jest.fn(() => false),
    connectTactileDisplay: jest.fn(async () => ({
      status: 'disconnected' as const,
      deviceName: null,
      transport: null,
      geometry: null,
      message: '',
    })),
    disconnectTactileDisplay: jest.fn(),
    preloadTactileDisplay: jest.fn(),
  };
  const chat: ChatStub = {
    updateWelcomeMessage: jest.fn(),
  };

  const registry = new ViewModelRegistry();
  registry.register('settings', settings as SettingsViewModel);
  registry.register('chat', chat as ChatViewModel);

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

  // Only the selected tab's panel is mounted, and the dialog opens on
  // "General", so reaching the control is part of the test.
  fireEvent.click(screen.getByRole('tab', { name: 'About' }));
}

/**
 * Finds the report link.
 * @returns The About panel's "Report an issue" link.
 */
function reportLink(): HTMLElement {
  return screen.getByRole('link', { name: LINK_NAME });
}

describe('settings About section: report an issue', () => {
  it('should expose the control as a link, so the browser can open it anywhere', () => {
    renderSettings();

    // A button with an onClick would announce "button", give no destination in
    // the status bar, offer no middle-click or "open in new tab" of the
    // reader's own, and be the kind of thing a popup blocker refuses.
    expect(reportLink().tagName).toBe('A');
  });

  it('should point at the prefilled report the builder produces', () => {
    renderSettings();

    expect(reportLink()).toHaveAttribute('href', buildIssueUrl(collectDiagnostics()));
  });

  it('should keep the visible label inside the accessible name', () => {
    renderSettings();

    // WCAG 2.5.3: a speech-input user says what they can see, so the name a
    // screen reader announces has to contain it.
    const link = reportLink();
    expect(link).toHaveTextContent(VISIBLE_LABEL);
    expect(link.getAttribute('aria-label')).toContain(VISIBLE_LABEL);
  });

  it('should say in its name that it leaves this tab', () => {
    renderSettings();

    // The reader meets the new tab before they can see it, so the warning has
    // to be in the name rather than only in the description.
    expect(reportLink().getAttribute('aria-label')).toContain('new tab');
  });

  it('should open a new tab without handing it a reference back to this one', () => {
    renderSettings();
    const link = reportLink();

    expect(link).toHaveAttribute('target', '_blank');
    // Reverse tabnabbing: without `noopener` the opened page can navigate the
    // page the chart is embedded in.
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('should describe what travels with the report before the reader leaves', () => {
    renderSettings();

    const id = reportLink().getAttribute('aria-describedby');
    expect(id).toBeTruthy();

    const hint = document.getElementById(id as string);
    expect(hint).not.toBeNull();
    // The diagnostics go to GitHub's form and nowhere else, and they are still
    // the reader's to edit — both said here, where the decision is still open.
    expect(hint).toHaveTextContent('diagnostics');
    expect(hint).toHaveTextContent('Nothing is sent until you submit it there');
  });
});
