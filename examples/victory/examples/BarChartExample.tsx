import type { JSX } from 'react';
import { VictoryAxis, VictoryBar, VictoryChart } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const data = [
  { x: 'Q1', y: 4200 },
  { x: 'Q2', y: 5800 },
  { x: 'Q3', y: 3900 },
  { x: 'Q4', y: 7100 },
];

export function BarChartExample(): JSX.Element {
  return (
    <div>
      <h2>Bar Chart</h2>
      <p>Simple bar chart showing quarterly revenue.</p>
      <MaidrVictory
        id="victory-bar"
        title="Quarterly Revenue"
        subtitle="2024 Fiscal Year"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Quarter" />
          <VictoryAxis dependentAxis label="Revenue ($)" />
          <VictoryBar data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
