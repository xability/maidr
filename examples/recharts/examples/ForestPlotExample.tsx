import type { JSX } from 'react';
import { ScatterChart, Scatter, ErrorBar, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';
import { Orientation } from '../../../src/type/grammar';

// The bounds here are ABSOLUTE (a confidence interval, not an offset), so the
// config declares yMinKey/yMaxKey. The `lo`/`hi` offsets below are what the
// Recharts <ErrorBar> needs, computed from the same numbers.
const studies = [
  { study: 'Silva 2018', or: 0.62, lower: 0.41, upper: 0.94, weight: 0.12 },
  { study: 'Nguyen 2020', or: 1.34, lower: 0.98, upper: 1.83, weight: 0.08 },
  { study: 'Okafor 2022', or: 1.71, lower: 1.22, upper: 2.40, weight: 0.55 },
  { study: 'Haddad 2023', or: 1.05, lower: 0.60, upper: 1.84, weight: 0.25 },
  { study: 'Pooled', or: 1.28, lower: 1.02, upper: 1.61, pooled: true },
];

const drawn = studies.map(row => ({
  ...row,
  offsets: [row.or - row.lower, row.upper - row.or] as [number, number],
}));

export function ForestPlotExample(): JSX.Element {
  return (
    <div>
      <h2>Forest Plot</h2>
      <p>
        A meta-analysis of four studies with the pooled summary last. MAIDR
        announces whether each interval crosses the null line at 1, and the
        weight each study carried — a magnitude a forest plot encodes as marker
        area and a reader is otherwise never told.
      </p>
      <MaidrRecharts
        id="forest-example"
        title="Effect of the intervention"
        subtitle="Odds ratio, random effects"
        data={studies}
        chartType="forest"
        xKey="study"
        yKeys={['or']}
        orientation={Orientation.HORIZONTAL}
        errorConfig={{ yMinKey: 'lower', yMaxKey: 'upper' }}
        forestConfig={{ weightKey: 'weight', pooledKey: 'pooled', nullValue: 1 }}
        xLabel="Study"
        yLabel="Odds ratio"
      >
        <ScatterChart width={600} height={350} layout="vertical" margin={{ left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="or" type="number" domain={[0, 3]} name="Odds ratio" />
          <YAxis dataKey="study" type="category" width={80} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <ReferenceLine x={1} stroke="#333" />
          <Scatter data={drawn} fill="#8884d8" isAnimationActive={false}>
            <ErrorBar dataKey="offsets" direction="x" width={6} stroke="#333" />
          </Scatter>
        </ScatterChart>
      </MaidrRecharts>
    </div>
  );
}
