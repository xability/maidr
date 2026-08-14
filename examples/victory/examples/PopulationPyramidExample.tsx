import type { JSX } from 'react';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryStack } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// A population pyramid is a `VictoryStack` of two bar series with one of them
// signed negative, drawn horizontally so the two sides grow left and right.
// The sign is a direction rather than a magnitude, and MAIDR reads it as one:
// the pitch carries the size and the announcement names the side.
const men = [
  { x: '0-14', y: -1200 },
  { x: '15-29', y: -1150 },
  { x: '30-44', y: -1080 },
  { x: '45-59', y: -990 },
  { x: '60-74', y: -720 },
  { x: '75+', y: -310 },
];

const women = [
  { x: '0-14', y: 1140 },
  { x: '15-29', y: 1100 },
  { x: '30-44', y: 1060 },
  { x: '45-59', y: 1010 },
  { x: '60-74', y: 830 },
  { x: '75+', y: 520 },
];

export function PopulationPyramidExample(): JSX.Element {
  return (
    <div>
      <h2>Population Pyramid</h2>
      <p>
        Population by age band and sex. Each bar announces its size and which
        side it points to, and the summary row reports which side is ahead.
      </p>
      <MaidrVictory
        id="victory-pyramid"
        title="Population by Age Band"
        subtitle="People, thousands"
      >
        <VictoryChart horizontal domainPadding={16}>
          <VictoryAxis label="Age band" />
          <VictoryAxis dependentAxis label="People (thousands)" tickFormat={t => Math.abs(t)} />
          <VictoryStack>
            <VictoryBar name="Men" data={men} />
            <VictoryBar name="Women" data={women} />
          </VictoryStack>
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
