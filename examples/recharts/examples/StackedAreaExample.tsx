import type { JSX } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// Each band's OWN value, never the accumulated top edge: MAIDR sums the
// series itself to announce the running total and each point's share of it.
const data = [
  { month: 'Jan', organic: 4000, paid: 2400, referral: 1800 },
  { month: 'Feb', organic: 4200, paid: 2100, referral: 1900 },
  { month: 'Mar', organic: 3800, paid: 2800, referral: 2200 },
  { month: 'Apr', organic: 4600, paid: 3200, referral: 2000 },
  { month: 'May', organic: 5100, paid: 2900, referral: 2400 },
  { month: 'Jun', organic: 5400, paid: 3600, referral: 2600 },
];

export function StackedAreaExample(): JSX.Element {
  return (
    <div>
      <h2>Stacked Area Chart</h2>
      <p>Stacked area chart showing sessions by acquisition source.</p>
      <MaidrRecharts
        id="stacked-area-example"
        title="Sessions by Source"
        subtitle="Stacked view"
        data={data}
        chartType="stacked_area"
        xKey="month"
        yKeys={['organic', 'paid', 'referral']}
        xLabel="Month"
        yLabel="Sessions"
      >
        <AreaChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="organic" stackId="a" stroke="#8884d8" fill="#8884d8" name="Organic" dot />
          <Area type="monotone" dataKey="paid" stackId="a" stroke="#82ca9d" fill="#82ca9d" name="Paid" dot />
          <Area type="monotone" dataKey="referral" stackId="a" stroke="#ffc658" fill="#ffc658" name="Referral" dot />
        </AreaChart>
      </MaidrRecharts>
    </div>
  );
}
