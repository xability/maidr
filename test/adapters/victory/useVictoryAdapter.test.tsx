/**
 * @jest-environment jsdom
 *
 * `useVictoryAdapter` republishes only when its fingerprint changes. The
 * figure's own id, title, subtitle and caption have to be part of it, or a
 * parent that renames the chart over the same data leaves MAIDR announcing
 * the old title.
 */

import type { VictoryAdapterConfig } from '@adapters/victory/types';
import type { Maidr as MaidrData } from '@type/grammar';
import { useVictoryAdapter } from '@adapters/victory/useVictoryAdapter';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { VictoryBar, VictoryChart } from 'victory';

const children = createElement(VictoryBar, { data: [{ x: 'a', y: 1 }, { x: 'b', y: 2 }] });

describe('useVictoryAdapter', () => {
  it('publishes a changed title, subtitle, caption and id over unchanged data', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const ref = { current: container };

    const { result, rerender } = renderHook(
      (config: VictoryAdapterConfig) => useVictoryAdapter(config, ref),
      { initialProps: { id: 'sales', title: 'Revenue', children } as VictoryAdapterConfig },
    );
    expect(result.current.title).toBe('Revenue');

    rerender({ id: 'sales-2', title: 'Profit', subtitle: 'FY26', caption: 'Source: ledger', children });

    expect(result.current).toMatchObject({
      id: 'sales-2',
      title: 'Profit',
      subtitle: 'FY26',
      caption: 'Source: ledger',
    });
    container.remove();
  });
});

describe('useVictoryAdapter on a figure of several charts', () => {
  /** A resize observer the test fires by hand, as a browser would. */
  const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
  const frames: FrameRequestCallback[] = [];
  const globals = globalThis as { ResizeObserver?: unknown };
  const savedObserver = globals.ResizeObserver;

  afterEach(() => {
    jest.restoreAllMocks();
    globals.ResizeObserver = savedObserver;
    observers.length = 0;
    frames.length = 0;
    document.body.innerHTML = '';
  });

  /**
   * A container holding one Victory chart svg per panel, laid out nowhere yet.
   * @param count - How many panels
   * @returns The container
   */
  function panelContainer(count: number): HTMLDivElement {
    const container = document.createElement('div');
    for (let at = 0; at < count; at++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'VictoryContainer';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('role', 'img');
      wrapper.appendChild(svg);
      container.appendChild(wrapper);
    }
    document.body.appendChild(container);
    return container;
  }

  /**
   * Draws each panel's svg one below the other.
   * @param container - The container
   */
  function stackPanels(container: HTMLElement): void {
    Array.from(container.querySelectorAll('svg')).forEach((svg, at) => {
      const top = at * 260;
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({ top, left: 8, width: 400, height: 220, right: 408, bottom: top + 220, x: 8, y: top }),
        configurable: true,
      });
    });
  }

  /** The panels' names, row by row. */
  const rowsOf = (data: MaidrData): (string | undefined)[][] =>
    data.subplots.map(row => row.map(subplot => subplot.layers[0]?.title));

  it('arranges the panels again when they are laid out after the figure was first read', () => {
    // A figure in a tab not shown yet is read before anything is drawn, so
    // its panels are one row. Shown, its charts stand one below the other,
    // and the figure was left a row: the stack read sideways.
    class ManualResizeObserver {
      private readonly entry: { callback: ResizeObserverCallback; targets: Element[] };
      public constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, targets: [] };
        observers.push(this.entry);
      }

      public observe(target: Element): void {
        this.entry.targets.push(target);
      }

      public unobserve(): void {}

      public disconnect(): void {
        this.entry.targets.length = 0;
      }
    }
    globals.ResizeObserver = ManualResizeObserver;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => {
      frames.push(frame);
      return frames.length;
    });
    const container = panelContainer(3);
    const charts = ['North Region', 'South Region', 'Combined Trend'].map(title =>
      createElement(VictoryChart, { key: title, title }, createElement(VictoryBar, { data: [{ x: 'Q1', y: 1 }] })));

    const { result } = renderHook(() => useVictoryAdapter({ id: 'stacked', children: charts }, { current: container }));
    const unlaid = rowsOf(result.current);
    stackPanels(container);
    act(() => {
      observers.filter(one => one.targets.includes(container))
        .forEach(one => one.callback([], one as unknown as ResizeObserver));
      frames.splice(0).forEach(frame => frame(0));
    });

    expect(unlaid).toEqual([['North Region', 'South Region', 'Combined Trend']]);
    expect(rowsOf(result.current)).toEqual([['North Region'], ['South Region'], ['Combined Trend']]);
  });
});
