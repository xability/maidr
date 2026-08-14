import type { JSX } from 'react';
import { VictoryArea, VictoryAxis, VictoryChart } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const data = [
  { x: 2018, y: 42 },
  { x: 2019, y: 55 },
  { x: 2020, y: 38 },
  { x: 2021, y: 71 },
  { x: 2022, y: 90 },
  { x: 2023, y: 84 },
];

export function AreaChartExample(): JSX.Element {
  return (
    <div>
      <h2>Area Chart</h2>
      <p>Area chart showing annual rainfall.</p>
      <MaidrVictory
        id="victory-area"
        title="Annual Rainfall"
        subtitle="2018–2023"
      >
        <VictoryChart domainPadding={{ y: 24 }}>
          <VictoryAxis label="Year" />
          <VictoryAxis dependentAxis label="Rainfall (cm)" />
          <VictoryArea data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
