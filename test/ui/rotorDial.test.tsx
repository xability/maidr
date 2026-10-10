/**
 * @jest-environment jsdom
 */

/**
 * Component tests for the visual rotor dial.
 *
 * The dial is for sighted readers only: the mode change is announced through
 * the rotor area's live region, so what is asserted here is that the dial
 * stays out of the accessibility tree, puts the current mode at the top of the
 * ring, and leaves once the reader stops turning.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createMaidrStore } from '@state/store';
import { turnDial } from '@state/viewModel/rotorNavigationViewModel';
import { act, render, screen } from '@testing-library/react';
import RotorDial from '@ui/component/RotorDial';
import { Provider } from 'react-redux';
import '@testing-library/jest-dom/jest-globals';

/**
 * Renders the dial over a real store, anchored on a stand-in plot.
 * @returns The store, for turning the dial
 */
function renderDial(): ReturnType<typeof createMaidrStore> {
  const store = createMaidrStore();
  const plot = document.createElement('div');
  render(
    <Provider store={store}>
      <RotorDial plot={plot} />
    </Provider>,
  );
  return store;
}

describe('RotorDial', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing before the rotor is cycled', () => {
    renderDial();
    expect(screen.queryByTestId('maidr-rotor-dial')).toBeNull();
  });

  it('shows the modes, hidden from assistive technology', () => {
    const store = renderDial();
    act(() => {
      store.dispatch(turnDial({ labels: ['DATA', 'LOWER', 'HIGHER'], index: 1, step: 1 }));
    });

    const dial = screen.getByTestId('maidr-rotor-dial');
    expect(dial).toHaveAttribute('aria-hidden', 'true');
    expect(dial).toBeVisible();
    expect(dial).toHaveTextContent('DATA');
    expect(dial).toHaveTextContent('HIGHER');
    expect(dial.querySelector('[data-current="true"]')).toHaveTextContent('LOWER');
  });

  it('fades out after the reader stops turning', () => {
    const store = renderDial();
    act(() => {
      store.dispatch(turnDial({ labels: ['DATA', 'LOWER'], index: 1, step: 1 }));
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    // Another turn keeps it up.
    act(() => {
      store.dispatch(turnDial({ labels: ['DATA', 'LOWER'], index: 0, step: 1 }));
    });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('maidr-rotor-dial')).toBeVisible();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('maidr-rotor-dial')).not.toBeVisible();
  });
});
