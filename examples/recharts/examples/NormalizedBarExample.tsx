import type { JSX } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// Pre-normalized to percentages
const data = [
  { department: 'Engineering', male: 68, female: 28, nonBinary: 4 },
  { department: 'Marketing', male: 42, female: 52, nonBinary: 6 },
  { department: 'Sales', male: 55, female: 40, nonBinary: 5 },
  { department: 'HR', male: 35, female: 58, nonBinary: 7 },
  { department: 'Finance', male: 50, female: 45, nonBinary: 5 },
];

export function NormalizedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Normalized (100%) Bar Chart</h2>
      <p>Normalized stacked bar showing gender distribution by department (percentages).</p>
      <MaidrRecharts
        id="normalized-bar-example"
        title="Gender Distribution by Department"
        subtitle="Percentage breakdown"
        data={data}
        chartType="normalized_bar"
        xKey="department"
        yKeys={['male', 'female', 'nonBinary']}
        fillKeys={['Male', 'Female', 'Non-Binary']}
        xLabel="Department"
        yLabel="Percentage (%)"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="department" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="male" stackId="a" fill="#8884d8" name="Male" />
          <Bar dataKey="female" stackId="a" fill="#82ca9d" name="Female" />
          <Bar dataKey="nonBinary" stackId="a" fill="#ffc658" name="Non-Binary" />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
