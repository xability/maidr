import type { Context } from '@model/context';
import type { AudioService } from '@service/audio';
import type { PointerGuidanceState } from '@type/state';
import { PointerGuidanceCommand } from '@command/pointerGuidance';
import { describe, expect, it, jest } from '@jest/globals';
import { Scope } from '@type/event';

interface Mocks {
  context: Context;
  audio: AudioService;
  moveToPointAndGetPointerGuidance: jest.Mock<(x: number, y: number) => PointerGuidanceState | null>;
  playPointerGuidance: jest.Mock<(g: PointerGuidanceState | null) => void>;
}

function createMocks(
  guidance: PointerGuidanceState | null = null,
  scope: Scope = Scope.TRACE,
): Mocks {
  const moveToPointAndGetPointerGuidance
    = jest.fn<(x: number, y: number) => PointerGuidanceState | null>().mockReturnValue(guidance);
  const playPointerGuidance = jest.fn<(g: PointerGuidanceState | null) => void>();

  const context = {
    moveToPointAndGetPointerGuidance,
    get scope() {
      return scope;
    },
  } as unknown as Context;
  const audio = { playPointerGuidance } as unknown as AudioService;

  return { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance };
}

describe('PointerGuidanceCommand.execute', () => {
  it('resets guidance when called with no event (pointer leave)', () => {
    const { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance } = createMocks();
    const command = new PointerGuidanceCommand(context, audio);

    command.execute();

    expect(moveToPointAndGetPointerGuidance).not.toHaveBeenCalled();
    expect(playPointerGuidance).toHaveBeenCalledWith(null);
  });

  it('resets guidance when event lacks client coordinates', () => {
    const { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance } = createMocks();
    const command = new PointerGuidanceCommand(context, audio);

    command.execute({} as Event);

    expect(moveToPointAndGetPointerGuidance).not.toHaveBeenCalled();
    expect(playPointerGuidance).toHaveBeenCalledWith(null);
  });

  it('navigates and plays guidance from event coordinates', () => {
    const guidance: PointerGuidanceState = {
      onCurve: false,
      distancePx: 25,
      curveVertical: 'below',
      curveHorizontal: 'right',
    };
    const { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance } = createMocks(guidance);
    const command = new PointerGuidanceCommand(context, audio);

    command.execute({ clientX: 42, clientY: 96 } as unknown as Event);

    expect(moveToPointAndGetPointerGuidance).toHaveBeenCalledWith(42, 96);
    expect(playPointerGuidance).toHaveBeenCalledWith(guidance);
  });

  it('no-ops outside trace scope when an event is provided', () => {
    const { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance }
      = createMocks(null, Scope.HELP);
    const command = new PointerGuidanceCommand(context, audio);

    command.execute({ clientX: 5, clientY: 5 } as unknown as Event);

    expect(moveToPointAndGetPointerGuidance).not.toHaveBeenCalled();
    expect(playPointerGuidance).not.toHaveBeenCalled();
  });

  it('still resets on pointer-leave outside trace scope', () => {
    // Reset must run regardless of scope so stale throttle state from a
    // prior trace-scope hover doesn't leak across scope changes.
    const { context, audio, playPointerGuidance } = createMocks(null, Scope.SUBPLOT);
    const command = new PointerGuidanceCommand(context, audio);

    command.execute();

    expect(playPointerGuidance).toHaveBeenCalledWith(null);
  });
});

describe('PointerGuidanceCommand.executeNavigateOnly', () => {
  it('navigates without playing guidance', () => {
    const { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance } = createMocks({
      onCurve: false,
      distancePx: 25,
      curveVertical: 'below',
      curveHorizontal: 'right',
    });
    const command = new PointerGuidanceCommand(context, audio);

    command.executeNavigateOnly({ clientX: 10, clientY: 20 } as unknown as Event);

    expect(moveToPointAndGetPointerGuidance).toHaveBeenCalledWith(10, 20);
    expect(playPointerGuidance).not.toHaveBeenCalled();
  });

  it('does nothing when event lacks client coordinates', () => {
    const { context, audio, moveToPointAndGetPointerGuidance, playPointerGuidance } = createMocks();
    const command = new PointerGuidanceCommand(context, audio);

    command.executeNavigateOnly({} as Event);

    expect(moveToPointAndGetPointerGuidance).not.toHaveBeenCalled();
    expect(playPointerGuidance).not.toHaveBeenCalled();
  });

  it('no-ops outside trace scope', () => {
    const { context, audio, moveToPointAndGetPointerGuidance }
      = createMocks(null, Scope.SUBPLOT);
    const command = new PointerGuidanceCommand(context, audio);

    command.executeNavigateOnly({ clientX: 1, clientY: 2 } as unknown as Event);

    expect(moveToPointAndGetPointerGuidance).not.toHaveBeenCalled();
  });
});
