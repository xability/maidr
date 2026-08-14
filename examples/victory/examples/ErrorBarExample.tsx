import type { JSX } from 'react';
import { VictoryAxis, VictoryChart, VictoryErrorBar } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// Victory's `errorY` is a distance from the estimate, either symmetric (a
// number) or asymmetric (`[plus, minus]`). MAIDR announces absolute bounds.
const data = [
  { x: 'Control', y: 4.2, errorY: 0.6 },
  { x: 'Low dose', y: 5.1, errorY: 0.9 },
  { x: 'Mid dose', y: 6.4, errorY: [1.2, 0.7] },
  { x: 'High dose', y: 6.9, errorY: 1.4 },
];

export function ErrorBarExample(): JSX.Element {
  return (
    <div>
      <h2>Error Bar</h2>
      <p>
        Group means with 95% confidence intervals. Up and down move between the
        lower bound, the estimate and the upper bound at one sample.
      </p>
      <MaidrVictory
        id="victory-error-bar"
        title="Response by Dose"
        subtitle="Mean with 95% CI"
      >
        <VictoryChart domainPadding={40}>
          <VictoryAxis label="Group" />
          <VictoryAxis dependentAxis label="Response (mmol/L)" />
          <VictoryErrorBar data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
