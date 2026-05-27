import type { JSX } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { month: 'Jan', users: 400 },
  { month: 'Feb', users: 600 },
  { month: 'Mar', users: 550 },
  { month: 'Apr', users: 780 },
  { month: 'May', users: 890 },
  { month: 'Jun', users: 1200 },
  { month: 'Jul', users: 1100 },
  { month: 'Aug', users: 1350 },
  { month: 'Sep', users: 1500 },
  { month: 'Oct', users: 1420 },
  { month: 'Nov', users: 1600 },
  { month: 'Dec', users: 1800 },
];

export function LineChartExample(): JSX.Element {
  return (
    <div>
      <h2>Line Chart</h2>
      <p>Line chart showing monthly active users over a year.</p>
      <MaidrRecharts
        id="line-example"
        title="Monthly Active Users"
        subtitle="2024"
        data={data}
        chartType="line"
        xKey="month"
        yKeys={['users']}
        xLabel="Month"
        yLabel="Active Users"
      >
        <LineChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="users" stroke="#8884d8" name="Users" dot />
        </LineChart>
      </MaidrRecharts>
    </div>
  );
}
