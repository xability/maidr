import type { JSX } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { bin: '0-10', count: 3, xMin: 0, xMax: 10 },
  { bin: '10-20', count: 7, xMin: 10, xMax: 20 },
  { bin: '20-30', count: 15, xMin: 20, xMax: 30 },
  { bin: '30-40', count: 22, xMin: 30, xMax: 40 },
  { bin: '40-50', count: 28, xMin: 40, xMax: 50 },
  { bin: '50-60', count: 35, xMin: 50, xMax: 60 },
  { bin: '60-70', count: 30, xMin: 60, xMax: 70 },
  { bin: '70-80', count: 20, xMin: 70, xMax: 80 },
  { bin: '80-90', count: 12, xMin: 80, xMax: 90 },
  { bin: '90-100', count: 5, xMin: 90, xMax: 100 },
];

export function HistogramExample(): JSX.Element {
  return (
    <div>
      <h2>Histogram</h2>
      <p>Histogram showing distribution of exam scores.</p>
      <MaidrRecharts
        id="histogram-example"
        title="Exam Score Distribution"
        subtitle="Fall 2024 Semester"
        data={data}
        chartType="histogram"
        xKey="bin"
        yKeys={['count']}
        binConfig={{ xMinKey: 'xMin', xMaxKey: 'xMax' }}
        xLabel="Score Range"
        yLabel="Number of Students"
      >
        <BarChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="bin" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#8884d8" name="Students" />
        </BarChart>
      </MaidrRecharts>
    </div>
  );
}
