import type { JSX } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

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
      <p>Simple bar chart showing quarterly revenue.</p>
      <MaidrRecharts
        id="bar-example"
        title="Quarterly Revenue"
        subtitle="2024 Fiscal Year"
        data={data}
        chartType="bar"
        xKey="quarter"
        yKeys={['revenue']}
        xLabel="Quarter"
        yLabel="Revenue ($)"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="quarter" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
