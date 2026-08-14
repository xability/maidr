import type { JSX } from 'react';
import { VictoryBar, VictoryChart, VictoryPolarAxis } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// A `VictoryBar` inside a `<VictoryChart polar>` draws a coxcomb: each value
// is a wedge whose radius is its magnitude. MAIDR pans by the wedge's angle
// rather than by its column, so the sweep goes out and back around the circle.
const data = [
  { x: 'N', y: 18 },
  { x: 'NE', y: 12 },
  { x: 'E', y: 7 },
  { x: 'SE', y: 9 },
  { x: 'S', y: 15 },
  { x: 'SW', y: 22 },
  { x: 'W', y: 27 },
  { x: 'NW', y: 21 },
];

export function PolarAreaExample(): JSX.Element {
  return (
    <div>
      <h2>Polar Area</h2>
      <p>Wind rose showing hours of wind from each compass direction.</p>
      <MaidrVictory
        id="victory-polar-area"
        title="Wind by Direction"
        subtitle="Hours per week"
      >
        <VictoryChart polar>
          <VictoryPolarAxis />
          <VictoryBar data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
