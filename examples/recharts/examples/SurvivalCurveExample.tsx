import type { JSX } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// A censored time is a subject who left the study without the event
// happening. The curve does not step there, which is exactly why a reader has
// to be told: a flat tail backed by two hundred subjects and one backed by
// three look identical.
const data = [
  { months: 0, treated: 1.0, control: 1.0, treatedCensored: false },
  { months: 3, treated: 0.94, control: 0.88, treatedCensored: false },
  { months: 6, treated: 0.88, control: 0.74, treatedCensored: true },
  { months: 9, treated: 0.81, control: 0.61, treatedCensored: false },
  { months: 12, treated: 0.77, control: 0.52, treatedCensored: true },
  { months: 18, treated: 0.71, control: 0.44, treatedCensored: false },
  { months: 24, treated: 0.68, control: 0.39, treatedCensored: false },
];

export function SurvivalCurveExample(): JSX.Element {
  return (
    <div>
      <h2>Survival Curve</h2>
      <p>
        Kaplan-Meier curves for two arms, drawn with
        {' '}
        <code>type="stepAfter"</code>
        {' '}
        — survival holds until an event drops it. Use the rotor to jump between
        the censored times.
      </p>
      <MaidrRecharts
        id="survival-example"
        title="Overall Survival"
        subtitle="Treated versus control"
        data={data}
        chartType="survival"
        xKey="months"
        yKeys={['treated', 'control']}
        fillKeys={['Treatment', 'Control']}
        survivalConfig={{ censoredKeys: ['treatedCensored'] }}
        xLabel="Months since randomisation"
        yLabel="Survival probability"
      >
        <LineChart width={600} height={350} data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="months" />
          <YAxis domain={[0, 1]} />
          <Tooltip />
          <Legend />
          <Line type="stepAfter" dataKey="treated" stroke="#8884d8" name="Treatment" dot />
          <Line type="stepAfter" dataKey="control" stroke="#82ca9d" name="Control" dot />
        </LineChart>
      </MaidrRecharts>
    </div>
  );
}
