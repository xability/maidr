import { beforeEach, describe, expect, it } from '@jest/globals';
import { Context } from '../../src/model/context';
import type { TraceState } from '../../src/type/state';
import { TraceType } from '../../src/type/grammar';

/**
 * Helper function to create a minimal mock Context for testing getInstruction
 */
function createMockContext(traceState: TraceState): Context {
  // Create a minimal mock figure that will use the provided trace state
  const mockTrace = {
    get state() { return traceState; },
    getId: () => 'test-trace',
    getCurrentXValue: () => 0,
    moveToXValue: () => false,
    resetToInitialEntry: () => {},
    isMovable: () => false,
    moveOnce: () => {},
    moveToExtreme: () => {},
    moveToIndex: () => {},
    dispose: () => {},
    notifyOutOfBounds: () => {},
    notifyStateUpdate: () => {},
    notifyObserversWithState: () => {},
    addObserver: () => {},
    removeObserver: () => {},
  };

  const mockSubplot = {
    get state() {
      return {
        empty: false as const,
        type: 'subplot' as const,
        size: 1,
        index: 0,
        trace: traceState,
        highlight: { empty: true as const, type: 'trace' as const, audio: { size: 10, index: 5 } },
      };
    },
    traces: [[mockTrace]],
    get activeTrace() { return mockTrace; },
    getRow: () => 0,
    getSize: () => 1,
    isMovable: () => false,
    moveOnce: () => {},
    moveToExtreme: () => {},
    moveToIndex: () => {},
    dispose: () => {},
    notifyOutOfBounds: () => {},
    notifyStateUpdate: () => {},
  };

  const mockFigure = {
    id: 'test-figure',
    subplots: [[mockSubplot]],
    get state() {
      return {
        empty: false as const,
        type: 'figure' as const,
        title: 'Test Figure',
        subtitle: '',
        caption: '',
        size: 1,
        index: 0,
        subplot: mockSubplot.state,
        traceTypes: ['line'],
        highlight: { empty: true as const, type: 'trace' as const, audio: { size: 0, index: 0 } },
      };
    },
    get activeSubplot() { return mockSubplot; },
    isMovable: () => false,
    moveOnce: () => {},
    moveToExtreme: () => {},
    moveToIndex: () => {},
    dispose: () => {},
  };

  return new Context(mockFigure as any);
}

describe('Context getInstruction method', () => {
  describe('Single line plot instructions', () => {
    let context: Context;

    beforeEach(() => {
      const singleLineState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.LINE,
        plotType: 'single line',
        title: 'Test Single Line',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.LINE, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
      };

      context = createMockContext(singleLineState);
    });

    it('should generate instruction for single line plot without group count', () => {
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: single line. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });

    it('should generate instruction for single line plot without click prompt', () => {
      const instruction = context.getInstruction(false);
      expect(instruction).toBe(
        'This is a maidr plot of type: single line.  Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });
  });

  describe('Multiline plot instructions with group count', () => {
    let context: Context;

    beforeEach(() => {
      const multilineState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.LINE,
        plotType: 'multiline',
        title: 'Test Multiline',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.LINE, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
        groupCount: 5,
      };

      context = createMockContext(multilineState);
    });

    it('should generate instruction for multiline plot with group count', () => {
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: multiline with 5 groups. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });

    it('should generate instruction for multiline plot without click prompt', () => {
      const instruction = context.getInstruction(false);
      expect(instruction).toBe(
        'This is a maidr plot of type: multiline with 5 groups.  Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });
  });

  describe('Multiline plot instructions with different group counts', () => {
    it('should handle multiline plot with 1 group', () => {
      const multilineState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.LINE,
        plotType: 'multiline',
        title: 'Test Multiline',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.LINE, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
        groupCount: 1,
      };

      const context = createMockContext(multilineState);
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: multiline with 1 groups. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });

    it('should handle multiline plot with many groups', () => {
      const multilineState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.LINE,
        plotType: 'multiline',
        title: 'Test Multiline',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.LINE, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
        groupCount: 10,
      };

      const context = createMockContext(multilineState);
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: multiline with 10 groups. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });
  });

  describe('Edge cases for multiline instructions', () => {
    it('should handle multiline plot without groupCount property', () => {
      const multilineState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.LINE,
        plotType: 'multiline',
        title: 'Test Multiline',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.LINE, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
        // No groupCount property
      };

      const context = createMockContext(multilineState);
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: multiline. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });

    it('should handle multiline plot with zero groupCount', () => {
      const multilineState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.LINE,
        plotType: 'multiline',
        title: 'Test Multiline',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.LINE, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
        groupCount: 0,
      };

      const context = createMockContext(multilineState);
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: multiline. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });
  });

  describe('Non-multiline plot types', () => {
    it('should not add group count for bar plots', () => {
      const barState: TraceState = {
        empty: false,
        type: 'trace',
        traceType: TraceType.BAR,
        plotType: 'bar',
        title: 'Test Bar',
        xAxis: 'X Axis',
        yAxis: 'Y Axis',
        fill: 'blue',
        hasMultiPoints: true,
        audio: { min: 0, max: 100, size: 10, value: 50, index: 5 },
        braille: { empty: true, type: 'trace', traceType: TraceType.BAR, audio: { size: 10, index: 5 } },
        text: { main: { label: 'X', value: 5 }, cross: { label: 'Y', value: 50 } },
        autoplay: { FORWARD: 1, BACKWARD: 1, UPWARD: 1, DOWNWARD: 1 },
        highlight: { empty: true, type: 'trace', audio: { size: 10, index: 5 } },
        groupCount: 5, // Should be ignored since it's not multiline
      };

      const context = createMockContext(barState);
      const instruction = context.getInstruction(true);
      expect(instruction).toBe(
        'This is a maidr plot of type: bar. Click to activate. Use Arrows to navigate data points. Toggle B for Braille, T for Text, S for Sonification, and R for Review mode.'
      );
    });
  });
});