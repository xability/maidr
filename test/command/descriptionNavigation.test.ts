/**
 * @jest-environment jsdom
 */

import type { RotorNavigationService } from '@service/rotor';
import type { DescriptionViewModel } from '@state/viewModel/descriptionViewModel';
import {
  DescriptionLayerNextCommand,
  DescriptionLayerPrevCommand,
  DescriptionSelectLayerCommand,
} from '@command/descriptionNavigation';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

type ViewModelStub = Pick<
  DescriptionViewModel,
  'focusPrevLayer' | 'focusNextLayer' | 'selectFocusedLayer'
>;

type RotorStub = Pick<RotorNavigationService, 'resetToDataMode'>;

function createViewModel(): ViewModelStub {
  return {
    focusPrevLayer: jest.fn(),
    focusNextLayer: jest.fn(),
    selectFocusedLayer: jest.fn(),
  };
}

function createRotor(): RotorStub {
  return { resetToDataMode: jest.fn() };
}

/** A keydown whose target is the given element, as hotkeys-js delivers it. */
function keydownOn(element: Element): Event {
  const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
  Object.defineProperty(event, 'target', { value: element });
  return event;
}

describe('moving the layer tab cursor', () => {
  test('left steps towards the first layer', () => {
    const viewModel = createViewModel();

    new DescriptionLayerPrevCommand(viewModel as DescriptionViewModel).execute();

    expect(viewModel.focusPrevLayer).toHaveBeenCalledTimes(1);
  });

  test('right steps towards the last layer', () => {
    const viewModel = createViewModel();

    new DescriptionLayerNextCommand(viewModel as DescriptionViewModel).execute();

    expect(viewModel.focusNextLayer).toHaveBeenCalledTimes(1);
  });
});

describe('confirming a layer tab with space', () => {
  let viewModel: ViewModelStub;
  let rotor: RotorStub;

  beforeEach(() => {
    document.body.innerHTML = '';
    viewModel = createViewModel();
    rotor = createRotor();
  });

  function command(): DescriptionSelectLayerCommand {
    return new DescriptionSelectLayerCommand(
      viewModel as DescriptionViewModel,
      rotor as RotorNavigationService,
    );
  }

  test('selects the focused layer when the press was aimed at the strip', () => {
    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    document.body.append(tab);

    command().execute(keydownOn(tab));

    expect(viewModel.selectFocusedLayer).toHaveBeenCalledTimes(1);
  });

  test('hands the rotor back to data mode first, as the PageUp path does', () => {
    // A rotor mode is an index on the service but a boolean on the trace, so
    // the outgoing layer has to clear its flag while it is still active.
    const tab = document.createElement('button');
    tab.setAttribute('role', 'tab');
    document.body.append(tab);

    command().execute(keydownOn(tab));

    expect(rotor.resetToDataMode).toHaveBeenCalledTimes(1);
  });

  test('selects when there is no event to read a target from', () => {
    command().execute();

    expect(viewModel.selectFocusedLayer).toHaveBeenCalledTimes(1);
  });

  test('hands the press back to the dialog button it was aimed at', () => {
    // Every key bound in a scope is preventDefault'ed before its command runs,
    // so without this Space would be a dead key on Close and "Show more rows".
    const close = document.createElement('button');
    const clicked = jest.fn();
    close.addEventListener('click', clicked);
    document.body.append(close);

    command().execute(keydownOn(close));

    expect(viewModel.selectFocusedLayer).not.toHaveBeenCalled();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  test('does nothing at all when the press was aimed at neither', () => {
    const paper = document.createElement('div');
    document.body.append(paper);

    command().execute(keydownOn(paper));

    expect(viewModel.selectFocusedLayer).not.toHaveBeenCalled();
    expect(rotor.resetToDataMode).not.toHaveBeenCalled();
  });
});
