import type { JSX } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const data = [
  { role: 'Nurse', pay: 62 },
  { role: 'Teacher', pay: 54 },
  { role: 'Engineer', pay: 88 },
  { role: 'Designer', pay: 71 },
  { role: 'Analyst', pay: 66 },
  { role: 'Technician', pay: 49 },
];

export function DotPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Dot Plot</h2>
      <p>Cleveland dot plot showing median pay by role.</p>
      <MaidrRecharts
        id="dot-example"
        title="Median Pay by Role"
        subtitle="Cleveland dot plot"
        data={data}
        chartType="dot"
        xKey="role"
        yKeys={['pay']}
        xLabel="Role"
        yLabel="Median pay ($k)"
      >
        <ScatterChart width={600} height={350}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="role" type="category" allowDuplicatedCategory={false} />
          <YAxis dataKey="pay" type="number" />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter name="Median pay" data={data} fill="#8884d8" />
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
