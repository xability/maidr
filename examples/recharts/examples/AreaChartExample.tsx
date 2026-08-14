import type { JSX } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { month: 'Jan', mm: 80 },
  { month: 'Feb', mm: 65 },
  { month: 'Mar', mm: 90 },
  { month: 'Apr', mm: 120 },
  { month: 'May', mm: 145 },
  { month: 'Jun', mm: 60 },
  { month: 'Jul', mm: 35 },
  { month: 'Aug', mm: 40 },
  { month: 'Sep', mm: 75 },
  { month: 'Oct', mm: 110 },
  { month: 'Nov', mm: 130 },
  { month: 'Dec', mm: 95 },
];

export function AreaChartExample(): JSX.Element {
  return (
    <div>
      <h2>Area Chart</h2>
      <p>Area chart showing monthly rainfall over a year.</p>
      <MaidrRecharts
        id="area-example"
        title="Monthly Rainfall"
        subtitle="2024"
        data={data}
        chartType="area"
        xKey="month"
        yKeys={['mm']}
        xLabel="Month"
        yLabel="Rainfall (mm)"
      >
        <AreaChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          {/* `dot` is required: the filled band is one path, so the dots are
              the only marks MAIDR can align to the data for highlighting. */}
          <Area type="monotone" dataKey="mm" stroke="#8884d8" fill="#8884d8" name="Rainfall" dot />
        </AreaChart>
      </MaidrRecharts>
    </div>
  );
}
