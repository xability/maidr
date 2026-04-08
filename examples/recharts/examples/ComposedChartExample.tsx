import type { JSX } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { month: 'Jan', revenue: 4200, trend: 4000 },
  { month: 'Feb', revenue: 5800, trend: 4800 },
  { month: 'Mar', revenue: 3900, trend: 5200 },
  { month: 'Apr', revenue: 7100, trend: 5800 },
  { month: 'May', revenue: 6200, trend: 6100 },
  { month: 'Jun', revenue: 8500, trend: 6800 },
];

export function ComposedChartExample(): JSX.Element {
  return (
    <div>
      <h2>Composed Chart (Bar + Line)</h2>
      <p>Combined bar and line chart showing revenue with a trend line. Uses composed (layers) mode.</p>
      <MaidrRecharts
        id="composed-example"
        title="Revenue and Trend"
        subtitle="H1 2024"
        data={data}
        xKey="month"
        layers={[
          { yKey: 'revenue', chartType: 'bar', name: 'Revenue' },
          { yKey: 'trend', chartType: 'line', name: 'Trend' },
        ]}
        xLabel="Month"
        yLabel="Amount ($)"
      >
        <ComposedChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
          <Line type="monotone" dataKey="trend" stroke="#ff7300" name="Trend" dot />
        </ComposedChart>
      </MaidrRecharts>
    </div>
  );
}
