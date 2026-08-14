import type { JSX } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// Raw counts, not the fractions `stackOffset="expand"` renders: MAIDR derives
// each band's share from the values it is given.
const data = [
  { quarter: 'Q1', desktop: 5200, mobile: 3100, tablet: 700 },
  { quarter: 'Q2', desktop: 4800, mobile: 3900, tablet: 800 },
  { quarter: 'Q3', desktop: 4300, mobile: 4600, tablet: 900 },
  { quarter: 'Q4', desktop: 3900, mobile: 5400, tablet: 850 },
];

export function NormalizedAreaExample(): JSX.Element {
  return (
    <div>
      <h2>100% Stacked Area Chart</h2>
      <p>Normalized area chart showing the share of visits by device.</p>
      <MaidrRecharts
        id="normalized-area-example"
        title="Visit Share by Device"
        subtitle="100% stacked"
        data={data}
        chartType="normalized_area"
        xKey="quarter"
        yKeys={['desktop', 'mobile', 'tablet']}
        xLabel="Quarter"
        yLabel="Visits"
      >
        <AreaChart width={600} height={350} data={data} stackOffset="expand">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="quarter" />
          <YAxis tickFormatter={value => `${Math.round(value * 100)}%`} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="desktop" stackId="a" stroke="#8884d8" fill="#8884d8" name="Desktop" dot />
          <Area type="monotone" dataKey="mobile" stackId="a" stroke="#82ca9d" fill="#82ca9d" name="Mobile" dot />
          <Area type="monotone" dataKey="tablet" stackId="a" stroke="#ffc658" fill="#ffc658" name="Tablet" dot />
        </AreaChart>
      </MaidrRecharts>
    </div>
  );
}
