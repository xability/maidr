/**
 * @jest-environment jsdom
 *
 * `useVictoryAdapter` republishes only when its fingerprint changes. The
 * figure's own id, title, subtitle and caption have to be part of it, or a
 * parent that renames the chart over the same data leaves MAIDR announcing
 * the old title.
 */

import type { VictoryAdapterConfig } from '@adapters/victory/types';
import { useVictoryAdapter } from '@adapters/victory/useVictoryAdapter';
import { describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { VictoryBar } from 'victory';

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
