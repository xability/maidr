import type { JSX } from 'react';
import { Pie, PieChart, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// `slice` is the constant that makes every wedge the same ANGLE; `deaths` is
// the measure, and it is the RADIUS. Pointing `yKeys` at the pie's own
// `dataKey` would announce 1 on every spoke.
const data = [
  { month: 'Jan', deaths: 120, slice: 1 },
  { month: 'Feb', deaths: 84, slice: 1 },
  { month: 'Mar', deaths: 61, slice: 1 },
  { month: 'Apr', deaths: 39, slice: 1 },
  { month: 'May', deaths: 27, slice: 1 },
  { month: 'Jun', deaths: 18, slice: 1 },
];

export function PolarAreaExample(): JSX.Element {
  return (
    <div>
      <h2>Polar Area (Coxcomb) Chart</h2>
      <p>
        A radar drawn as wedges: the same categories around the same circle,
        with the value as the radius. MAIDR reads it exactly as it reads a
        radar — the two differ in the mark, not in what a reader navigates — so
        each wedge is panned to its position around the dial and a sweep goes
        out and comes back rather than running left to right.
      </p>
      <MaidrRecharts
        id="coxcomb-example"
        title="Deaths by Month"
        subtitle="First half of the campaign"
        data={data}
        chartType="polar_area"
        xKey="month"
        yKeys={['deaths']}
        xLabel="Month"
        yLabel="Deaths"
      >
        <PieChart width={420} height={420}>
          <Pie
            data={data}
            dataKey="slice"
            nameKey="month"
            outerRadius={(row: { deaths: number }) => 40 + row.deaths}
            fill="#8884d8"
            isAnimationActive={false}
          />
          <Tooltip />
        </PieChart>
      </MaidrRecharts>
    </div>
  );
}
