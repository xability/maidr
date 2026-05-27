import type { JSX } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { height: 150, weight: 50 },
  { height: 155, weight: 55 },
  { height: 160, weight: 58 },
  { height: 162, weight: 62 },
  { height: 165, weight: 60 },
  { height: 168, weight: 65 },
  { height: 170, weight: 68 },
  { height: 172, weight: 70 },
  { height: 175, weight: 73 },
  { height: 178, weight: 75 },
  { height: 180, weight: 80 },
  { height: 182, weight: 78 },
  { height: 185, weight: 85 },
  { height: 188, weight: 88 },
  { height: 190, weight: 92 },
];

export function ScatterChartExample(): JSX.Element {
  return (
    <div>
      <h2>Scatter Chart</h2>
      <p>Scatter plot showing height vs weight correlation.</p>
      <MaidrRecharts
        id="scatter-example"
        title="Height vs Weight"
        subtitle="Sample of 15 individuals"
        data={data}
        chartType="scatter"
        xKey="height"
        yKeys={['weight']}
        xLabel="Height (cm)"
        yLabel="Weight (kg)"
      >
        <ScatterChart width={600} height={350}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="height" name="Height" type="number" />
          <YAxis dataKey="weight" name="Weight" type="number" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="Individuals" data={data} fill="#8884d8" />
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
