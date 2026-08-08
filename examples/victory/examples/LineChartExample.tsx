import type { JSX } from 'react';
import { VictoryAxis, VictoryChart, VictoryLine } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const data = [
  { x: 'Jan', y: 120 },
  { x: 'Feb', y: 180 },
  { x: 'Mar', y: 150 },
  { x: 'Apr', y: 220 },
  { x: 'May', y: 300 },
  { x: 'Jun', y: 260 },
];

export function LineChartExample(): JSX.Element {
  return (
    <div>
      <h2>Line Chart</h2>
      <p>Line chart showing monthly active users.</p>
      <MaidrVictory
        id="victory-line"
        title="Monthly Active Users"
        subtitle="First Half 2024"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Month" />
          <VictoryAxis dependentAxis label="Users (thousands)" />
          <VictoryLine data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
