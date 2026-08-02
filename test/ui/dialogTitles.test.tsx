/**
 * @jest-environment jsdom
 */

/**
 * Component tests for the one-heading-per-dialog contract (#665).
 *
 * `e2e_tests/specs/dialogAccessibility.spec.ts` asserts the same contract in a
 * real browser and remains the stronger check — jsdom's accessibility tree is
 * not a screen reader, and these say the wiring is intact, not that the
 * announcement is good. What they add is reach: the e2e job runs chromium-only
 * on a pull request and needs a build first, while these run in the ordinary
 * jest pass, which is where a regression of this class is cheapest to catch.
 *
 * Three failures are in scope, all of which shipped once:
 *   - a heading rendered inside `DialogTitle`, itself a heading, putting the
 *     title in the outline twice;
 *   - an inner element carrying the same id as the `DialogTitle` around it, so
 *     two elements claimed the id the dialog points at;
 *   - a `DialogTitle` holding the close button as well as the title, so the
 *     button's label was concatenated into the dialog's accessible name.
 */

import type { CommandExecutor } from '@service/commandExecutor';
import type { ChatViewModel } from '@state/viewModel/chatViewModel';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import type { HelpViewModel } from '@state/viewModel/helpViewModel';
import type { SettingsViewModel } from '@state/viewModel/settingsViewModel';
import type { HelpMenuItem } from '@type/help';
import type { DescriptionState } from '@type/state';
import type { ReactElement } from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { MaidrContext } from '@state/context';
import { createMaidrStore } from '@state/store';
import { ViewModelRegistry } from '@state/viewModel/registry';
import { render, screen } from '@testing-library/react';
import Chat from '@ui/component/Chat';
import Description from '@ui/component/Description';
import Help from '@ui/component/Help';
import { Provider } from 'react-redux';
// The `/jest-globals` entry point, not the bare one: it augments the `expect`
// imported from @jest/globals rather than the ambient global.
import '@testing-library/jest-dom/jest-globals';

// `Chat` opens with no messages, so `MessageBubble` never mounts here — mock it
// away to keep its ESM-only markdown chain (react-markdown et al.) out of the
// ts-jest CJS transform, as test/adapters/recharts/panelDom.test.ts does for
// the same reason.
jest.mock('@ui/components/MessageBubble', () => ({ MessageBubble: () => null }));

const CHAT_NAME = 'Chart Assistant';
const CLOSE_BUTTON_NAME = 'Close chat dialog';

const HELP_ITEMS: HelpMenuItem[] = [
  { description: 'Move to the next data point', key: 'Right Arrow' },
  { description: 'Toggle braille mode', key: 'B' },
];

const DESCRIPTION_DATA: DescriptionState = {
  chartType: 'Bar Chart',
  title: 'Sales by quarter',
  axes: { x: 'Quarter', y: 'Sales' },
  stats: [{ label: 'Max', value: 42 }],
  dataTable: {
    headers: ['Quarter', 'Sales'],
    rows: [['Q1', 10], ['Q2', 42]],
  },
};

/** The `HelpViewModel` surface `Help` actually calls. */
type HelpStub = Pick<HelpViewModel, 'toggle'>;

/** The `DescriptionViewModel` surface `Description` actually calls. */
type DescriptionStub = Pick<DescriptionViewModel, 'toggle'>;

/** The `ChatViewModel` surface `Chat` actually calls. */
type ChatStub = Pick<ChatViewModel, 'toggle' | 'sendMessage' | 'canSend'>;

/** The `SettingsViewModel` surface `Chat` actually calls. */
type SettingsStub = Pick<SettingsViewModel, 'toggle'>;

/**
 * Renders a dialog the way `App` does — a Redux `Provider` outside the MAIDR
 * context — so the component reaches its slice through the same
 * `useViewModelState` path it uses at runtime.
 *
 * The store is the production one rather than a partial stand-in: these
 * components read a slice each, but `createMaidrStore` is what guarantees the
 * slice they read is the one the app registers.
 * @param registry - Registry holding the stub view models for this dialog.
 * @param seed - Actions to put the slice into the state under test.
 * @param ui - The dialog to render.
 */
function renderDialog(
  registry: ViewModelRegistry,
  seed: { type: string; payload: unknown }[],
  ui: ReactElement,
): void {
  const store = createMaidrStore();
  // Dispatched by action type rather than through the slice's creator, which
  // is module-private. A drift in the type string is not silent: the slice
  // keeps its initial state and the dialog fails to render at all.
  seed.forEach(action => store.dispatch(action));

  render(
    <Provider store={store}>
      <MaidrContext.Provider
        value={{
          viewModelRegistry: registry,
          commandExecutor: {} as unknown as CommandExecutor,
        }}
      >
        {ui}
      </MaidrContext.Provider>
    </Provider>,
  );
}

/** Renders the help dialog with stub view models. */
function renderHelp(): void {
  // Typed as a `Pick` of the real view model rather than cast straight from an
  // object literal, so a rename or a changed signature fails here instead of
  // drifting silently behind an `as unknown as`.
  const help: HelpStub = { toggle: jest.fn() };

  const registry = new ViewModelRegistry();
  registry.register('help', help as HelpViewModel);

  renderDialog(
    registry,
    [{ type: 'help/setHelpItems', payload: HELP_ITEMS }],
    <Help />,
  );
}

/** Renders the description dialog with stub view models. */
function renderDescription(): void {
  const description: DescriptionStub = { toggle: jest.fn() };

  const registry = new ViewModelRegistry();
  registry.register('description', description as DescriptionViewModel);

  renderDialog(
    registry,
    [{ type: 'description/setDescription', payload: DESCRIPTION_DATA }],
    <Description />,
  );
}

/** Renders the chat dialog with stub view models. */
function renderChat(): void {
  const chat: ChatStub = {
    toggle: jest.fn(),
    sendMessage: jest.fn<(newMessage: string) => Promise<void>>(),
    canSend: true,
  };
  const settings: SettingsStub = { toggle: jest.fn() };

  const registry = new ViewModelRegistry();
  registry.register('chat', chat as ChatViewModel);
  registry.register('settings', settings as SettingsViewModel);

  // An empty message list is the state the dialog opens in, and it keeps the
  // outline to the title alone — a rendered message can carry headings of its
  // own now that chat markdown allows them.
  renderDialog(registry, [], <Chat />);
}

/**
 * Reports how the open dialog is named and what its heading outline looks like.
 *
 * Mirrors the helper in `dialogAccessibility.spec.ts`, and resolves the same
 * way assistive technology does rather than asserting on the markup that
 * produces it: `idCarriers` counts the elements actually claiming the
 * referenced id, so a dangling reference (0) or a duplicated one (2+) fails
 * even when the name still computes correctly.
 * @returns The dialog's labelling and heading structure.
 */
function dialogStructure(): {
  idCarriers: number;
  nestedHeadings: string[];
  headings: string[];
} {
  const dialog = screen.getByRole('dialog');
  const labelledBy = dialog.getAttribute('aria-labelledby');
  const headings = [...dialog.querySelectorAll('h1,h2,h3,h4,h5,h6')];

  return {
    // Matched by property rather than by an `[id="…"]` selector, because
    // React's `useId` produces ids containing characters a selector would have
    // to escape and there is nothing here to escape them with: this
    // environment exposes no `CSS` object at all, so `CSS.escape` is a
    // ReferenceError rather than a missing method. It comes from the jsdom
    // that `jest-environment-jsdom` bundles (20.x), not the `jsdom` in
    // devDependencies (22.x) — those are separate installs on separate major
    // lines, so check the nested one before assuming a DOM API is available.
    idCarriers: labelledBy
      ? [...document.querySelectorAll('[id]')].filter(el => el.id === labelledBy).length
      : 0,
    nestedHeadings: headings
      .filter((h) => {
        // Scoped to the dialog, as in the e2e helper: `closest` walks the whole
        // ancestor chain, so an unscoped match could report a nesting that
        // belongs to markup around the dialog rather than inside it.
        const ancestor = h.parentElement?.closest('h1,h2,h3,h4,h5,h6');
        return ancestor ? dialog.contains(ancestor) : false;
      })
      .map(h => h.tagName),
    headings: headings.map(h => `${h.tagName}:${h.textContent?.trim()}`),
  };
}

describe('dialog titles', () => {
  describe('help', () => {
    it('should name the dialog after the title it renders', () => {
      renderHelp();

      expect(screen.getByRole('dialog')).toHaveAccessibleName('Keyboard Shortcuts');
    });

    it('should put the title in the outline exactly once', () => {
      renderHelp();

      const structure = dialogStructure();

      expect(structure.headings).toEqual(['H2:Keyboard Shortcuts']);
      expect(structure.nestedHeadings).toEqual([]);
      expect(structure.idCarriers).toBe(1);
    });
  });

  describe('description', () => {
    it('should name the dialog after the title it renders', () => {
      renderDescription();

      expect(screen.getByRole('dialog')).toHaveAccessibleName('Chart Description');
    });

    /**
     * The defect this replaces: the id sat on a `Typography` inside
     * `DialogTitle`, and MUI resolves the title's own id as `idProp ?? titleId`
     * — so with no `idProp` the wrapper took the same id from `DialogContext`
     * and two elements carried it.
     */
    it('should leave exactly one element claiming the id it points at', () => {
      renderDescription();

      expect(dialogStructure().idCarriers).toBe(1);
    });

    it('should rank the title above the sections it introduces', () => {
      renderDescription();

      const structure = dialogStructure();

      expect(structure.headings[0]).toBe('H2:Chart Description');
      // `subtitle2` maps to `h6`, so the sections used to skip h2 straight to
      // h6 — and, being inside the title heading, nested one heading in another.
      expect(structure.headings.slice(1).every(h => h.startsWith('H3:'))).toBe(true);
      expect(structure.headings.filter(h => h.endsWith(':Chart Description'))).toHaveLength(1);
      expect(structure.nestedHeadings).toEqual([]);
    });
  });

  describe('chat', () => {
    /**
     * The title row holds the close button as well as the title. While MUI
     * named the dialog after that whole row, the button's label was appended
     * to the name: "Chart Assistant - AI Chat Interface Close chat dialog".
     *
     * What this asserts is where the dialog points, not what the name comes
     * out as, and the distinction is load-bearing: jsdom does not reproduce
     * the concatenation. Reverting the fix leaves `toHaveAccessibleName` still
     * returning the title alone, because `dom-accessibility-api` does not fold
     * a descendant button's `aria-label` into the row's name the way a browser
     * does — so a name assertion here would pass against the very bug it was
     * written to reject. `dialogAccessibility.spec.ts` checks the computed
     * name in a real browser; what is worth checking in jsdom is the structure
     * that produced it.
     */
    it('should point at the heading alone, not at a title row holding a control', () => {
      renderChat();

      const dialog = screen.getByRole('dialog');
      const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');

      expect(title).not.toBeNull();
      expect(title).toHaveTextContent('Chart Assistant');
      // The close button is still there and still labelled — just no longer
      // inside the element the dialog is named after.
      expect(screen.getByRole('button', { name: CLOSE_BUTTON_NAME })).toBeInTheDocument();
      expect(
        title?.querySelector('button, a[href], input, select, textarea, [role="button"]'),
      ).toBeNull();
    });

    /**
     * #710: the heading carried `aria-label="Chart Assistant - AI Chat
     * Interface"`, so it announced more than it showed — both as a heading and
     * as the dialog's name, since the dialog is named after it. Removing the
     * label is what makes the two agree.
     *
     * Asserted as an equality between the visible text and the computed name
     * rather than against the string alone: that is the contract, and it holds
     * a re-added `aria-label` to account whatever wording it uses.
     */
    it('should announce the dialog as exactly what the heading shows', () => {
      renderChat();

      const dialog = screen.getByRole('dialog');
      const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');

      expect(title?.textContent?.trim()).toBe(CHAT_NAME);
      expect(title?.getAttribute('aria-label')).toBeNull();
      expect(dialog).toHaveAccessibleName(title?.textContent?.trim() ?? '');
      expect(dialog.getAttribute('aria-label')).toBeNull();
    });

    it('should put the title in the outline exactly once', () => {
      renderChat();

      const structure = dialogStructure();

      expect(structure.headings).toEqual(['H2:Chart Assistant']);
      expect(structure.nestedHeadings).toEqual([]);
      expect(structure.idCarriers).toBe(1);
    });
  });
});
