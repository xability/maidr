/**
 * Reading a figure's labels must not cost an announcement.
 *
 * The title, subtitle, caption, axis labels and panel count are fixed by the
 * `Figure` constructor, but `Figure.state` carries them alongside the focused
 * subplot's state -- and through it the active trace's audio, braille, text and
 * highlight. `DescriptionService` reads five of them in a row.
 */

import type { Maidr } from '@type/grammar';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AbstractTrace } from '@model/abstract';
import { Context } from '@model/context';
import { DEFAULT_FIGURE_AXIS, Figure } from '@model/plot';
import { TraceType } from '@type/grammar';

/**
 * A figure of `panels` single-layer bar subplots.
 * @param panels How many subplots the figure holds
 * @param labels The figure-level title, subtitle, caption and axes
 * @returns The MAIDR payload
 */
function createMaidr(panels: number, labels: Partial<Maidr> = {}): Maidr {
  return {
    id: 'metadata-test',
    ...labels,
    subplots: Array.from({ length: panels }, (_, index) => [{
      layers: [{
        id: String(index),
        type: TraceType.BAR,
        data: [{ x: 'A', y: 1 }, { x: 'B', y: 2 }],
      }],
    }]),
  };
}

describe('context reads figure metadata without building a state', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('answers six metadata questions without computing a trace state', () => {
    const context = new Context(new Figure(createMaidr(1, {
      title: 'Sales',
      subtitle: 'By quarter',
      caption: 'Source: ledger',
      axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    })));
    const traceState = jest.spyOn(AbstractTrace.prototype, 'state', 'get');

    const read = [
      context.figureTitle,
      context.figureSubtitle,
      context.figureCaption,
      context.figureXAxis,
      context.figureYAxis,
      String(context.isMultiPanel),
    ];

    expect(read).toEqual([
      'Sales',
      'By quarter',
      'Source: ledger',
      'Quarter',
      'Revenue',
      'false',
    ]);
    expect(traceState).not.toHaveBeenCalled();
  });

  it('reports the same labels the figure state carries', () => {
    const figure = new Figure(createMaidr(2, {
      title: 'Sales',
      subtitle: 'By quarter',
      caption: 'Source: ledger',
      axes: { x: { label: 'Quarter' }, y: { label: 'Revenue' } },
    }));
    const context = new Context(figure);

    const state = figure.state;

    expect(state.empty).toBe(false);
    if (!state.empty) {
      expect(context.figureTitle).toBe(state.title);
      expect(context.figureSubtitle).toBe(state.subtitle);
      expect(context.figureCaption).toBe(state.caption);
      expect(context.figureXAxis).toBe(state.xAxis);
      expect(context.figureYAxis).toBe(state.yAxis);
      expect(context.isMultiPanel).toBe(state.size > 1);
    }
  });

  it('falls back to the model defaults for an unlabelled figure', () => {
    const context = new Context(new Figure(createMaidr(1)));

    expect(context.figureXAxis).toBe(DEFAULT_FIGURE_AXIS);
    expect(context.isAuthoredTitle(context.figureTitle)).toBe(false);
    expect(context.isAuthoredSubtitle(context.figureSubtitle)).toBe(false);
    expect(context.isAuthoredCaption(context.figureCaption)).toBe(false);
    expect(context.isAuthoredAxisLabel(context.figureXAxis)).toBe(false);
  });

  it('reports a multi-panel figure as one', () => {
    const context = new Context(new Figure(createMaidr(3)));

    expect(context.isMultiPanel).toBe(true);
  });

  it('never sees an empty figure state, which is why there is no fallback', () => {
    // The accessors above read the figure's fields rather than its state, so
    // they cannot answer an empty one. `Figure.state` has no empty variant --
    // the empty shape belongs to `outOfBoundsState`, which Context never
    // reads. If that ever changes, this fails and the accessors need their
    // sentinel branches back.
    const populated = new Figure(createMaidr(1)).state;
    const layerless = new Figure({
      id: 'layerless',
      subplots: [[{ layers: [] }]],
    }).state;

    expect(populated.empty).toBe(false);
    expect(layerless.empty).toBe(false);
  });

  it('still enters a lone layerless subplot at figure level', () => {
    const context = new Context(new Figure({
      id: 'layerless',
      subplots: [[{ layers: [] }]],
    }));

    expect(context.activeLevel).toBe('figure');
  });

  it('still enters a single-panel single-layer figure at trace level', () => {
    const context = new Context(new Figure(createMaidr(1)));

    expect(context.activeLevel).toBe('trace');
  });

  it('still stops at subplot level when the lone panel has several layers', () => {
    const context = new Context(new Figure({
      id: 'layered',
      subplots: [[{
        layers: [
          { id: '0', type: TraceType.BAR, data: [{ x: 'A', y: 1 }] },
          { id: '1', type: TraceType.LINE, data: [[{ x: 'A', y: 1 }]] },
        ],
      }]],
    }));

    expect(context.instructionContext.level).toBe('subplot');
  });
});
