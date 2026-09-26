import type { JSX } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const data = [
  { quarter: 'Q1', 'Product A': 2400, 'Product B': 1800 },
  { quarter: 'Q2', 'Product A': 3100, 'Product B': 2700 },
  { quarter: 'Q3', 'Product A': 2200, 'Product B': 1700 },
  { quarter: 'Q4', 'Product A': 3800, 'Product B': 3300 },
];

export function GroupedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Grouped Bar</h2>
      <p>Grouped (dodged) bar chart comparing two product lines per quarter.</p>
      <MaidrNivo
        id="nivo-grouped"
        title="Revenue by Product"
        subtitle="2024 Fiscal Year"
        type="bar"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveBar
            data={data}
            keys={['Product A', 'Product B']}
            indexBy="quarter"
            groupMode="grouped"
            margin={{ top: 20, right: 120, bottom: 50, left: 70 }}
            padding={0.3}
            axisBottom={{ legend: 'Quarter', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Revenue ($)', legendPosition: 'middle', legendOffset: -60 }}
            legends={[{
              dataFrom: 'keys',
              anchor: 'right',
              direction: 'column',
              translateX: 110,
              itemWidth: 100,
              itemHeight: 20,
            }]}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
