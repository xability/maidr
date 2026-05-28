import type { JSX } from 'react';
import { VictoryAxis, VictoryChart, VictoryScatter } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const data = [
  { x: 1, y: 2.3 },
  { x: 2, y: 3.1 },
  { x: 3, y: 2.8 },
  { x: 4, y: 4.5 },
  { x: 5, y: 5.2 },
  { x: 6, y: 4.9 },
  { x: 7, y: 6.4 },
];

export function ScatterChartExample(): JSX.Element {
  return (
    <div>
      <h2>Scatter Chart</h2>
      <p>Scatter plot of observed measurements.</p>
      <MaidrVictory
        id="victory-scatter"
        title="Measurement Scatter"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Sample" />
          <VictoryAxis dependentAxis label="Value" />
          <VictoryScatter data={data} size={5} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
