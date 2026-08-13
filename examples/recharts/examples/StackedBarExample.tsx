import type { JSX } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { month: 'Jan', electronics: 4000, clothing: 2400, food: 1800 },
  { month: 'Feb', electronics: 3000, clothing: 1398, food: 2100 },
  { month: 'Mar', electronics: 2000, clothing: 9800, food: 2900 },
  { month: 'Apr', electronics: 2780, clothing: 3908, food: 2500 },
  { month: 'May', electronics: 1890, clothing: 4800, food: 3100 },
  { month: 'Jun', electronics: 2390, clothing: 3800, food: 2800 },
];

export function StackedBarExample(): JSX.Element {
  return (
    <div>
      <h2>Stacked Bar Chart</h2>
      <p>Stacked bar chart showing monthly sales by product category.</p>
      <MaidrRecharts
        id="stacked-bar-example"
        title="Monthly Sales by Category"
        subtitle="Stacked view"
        data={data}
        chartType="stacked_bar"
        xKey="month"
        yKeys={['electronics', 'clothing', 'food']}
        fillKeys={['Electronics', 'Clothing', 'Food']}
        xLabel="Month"
        yLabel="Sales ($)"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="electronics" stackId="a" fill="#8884d8" name="Electronics" />
          <Bar dataKey="clothing" stackId="a" fill="#82ca9d" name="Clothing" />
          <Bar dataKey="food" stackId="a" fill="#ffc658" name="Food" />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
