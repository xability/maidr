import type { JSX } from 'react';
import { ResponsiveBar } from '@nivo/bar';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const data = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];

export function BarChartExample(): JSX.Element {
  return (
    <div>
      <h2>Bar Chart</h2>
      <p>
        Simple bar chart showing quarterly revenue. It is as wide as the
        window allows, so resizing the window redraws it.
      </p>
      <MaidrNivo
        id="nivo-bar"
        title="Quarterly Revenue"
        subtitle="2024 Fiscal Year"
        type="bar"
      >
        <div style={{ width: 'min(700px, 80vw)', height: 400 }}>
          <ResponsiveBar
            data={data}
            keys={['revenue']}
            indexBy="quarter"
            margin={{ top: 20, right: 30, bottom: 50, left: 70 }}
            padding={0.3}
            axisBottom={{ legend: 'Quarter', legendPosition: 'middle', legendOffset: 36 }}
            axisLeft={{ legend: 'Revenue ($)', legendPosition: 'middle', legendOffset: -60 }}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
