import type { JSX } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { city: 'New York', temperature2023: 55, temperature2024: 58 },
  { city: 'Chicago', temperature2023: 48, temperature2024: 51 },
  { city: 'Houston', temperature2023: 72, temperature2024: 74 },
  { city: 'Phoenix', temperature2023: 85, temperature2024: 87 },
  { city: 'Seattle', temperature2023: 52, temperature2024: 54 },
];

export function DodgedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Dodged (Grouped) Bar Chart</h2>
      <p>Grouped bar chart comparing average temperatures across two years.</p>
      <MaidrRecharts
        id="dodged-bar-example"
        title="Average Temperature by City"
        subtitle="2023 vs 2024"
        data={data}
        chartType="dodged_bar"
        xKey="city"
        yKeys={['temperature2023', 'temperature2024']}
        fillKeys={['2023', '2024']}
        xLabel="City"
        yLabel="Temperature (F)"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="city" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="temperature2023" fill="#8884d8" name="2023" />
          <Bar dataKey="temperature2024" fill="#82ca9d" name="2024" />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
