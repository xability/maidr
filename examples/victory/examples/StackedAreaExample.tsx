import type { JSX } from 'react';
import { VictoryArea, VictoryAxis, VictoryChart, VictoryStack } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

const solar = [
  { x: 2019, y: 12 },
  { x: 2020, y: 18 },
  { x: 2021, y: 27 },
  { x: 2022, y: 34 },
];

const wind = [
  { x: 2019, y: 30 },
  { x: 2020, y: 33 },
  { x: 2021, y: 35 },
  { x: 2022, y: 41 },
];

const hydro = [
  { x: 2019, y: 21 },
  { x: 2020, y: 20 },
  { x: 2021, y: 22 },
  { x: 2022, y: 19 },
];

export function StackedAreaExample(): JSX.Element {
  return (
    <div>
      <h2>Stacked Area</h2>
      <p>
        Stacked area chart of renewable generation by source. Each band is
        announced with its own value and its share of the column total.
      </p>
      <MaidrVictory
        id="victory-stacked-area"
        title="Renewable Generation by Source"
        subtitle="2019–2022"
      >
        <VictoryChart domainPadding={{ y: 24 }}>
          <VictoryAxis label="Year" />
          <VictoryAxis dependentAxis label="Generation (TWh)" />
          <VictoryStack>
            <VictoryArea name="Solar" data={solar} />
            <VictoryArea name="Wind" data={wind} />
            <VictoryArea name="Hydro" data={hydro} />
          </VictoryStack>
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
