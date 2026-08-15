import type { JSX } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

// The observations, with their RAW values. This is what MAIDR is given: it
// derives each column's own extent and pitches a value against its own axis,
// so handing it the normalised numbers below would make every axis run 0 to 1
// and flatten the one thing the chart is drawn to show.
const cars = [
  { car: 'Mazda RX4', mpg: 21, hp: 110, wt: 2.62 },
  { car: 'Datsun 710', mpg: 22.8, hp: 93, wt: 2.32 },
  { car: 'Hornet 4 Drive', mpg: 21.4, hp: 110, wt: 3.215 },
  { car: 'Valiant', mpg: 18.1, hp: 105, wt: 3.46 },
  { car: 'Merc 450SL', mpg: 17.3, hp: 180, wt: 3.73 },
];

const dimensions = [
  { label: 'Miles per gallon', key: 'mpg' },
  { label: 'Horsepower', key: 'hp' },
  { label: 'Weight (1000 lb)', key: 'wt' },
] as const;

// What the CHART is drawn from: the transpose, min-max normalised onto one
// shared scale, because a Recharts <Line> binds to a single yAxisId and a
// polyline crossing axes of different units cannot be drawn any other way.
const axisRows = dimensions.map(({ label, key }) => {
  const values = cars.map(car => car[key] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const row: Record<string, number | string> = { axis: label };
  cars.forEach((car, index) => {
    row[`obs${index}`] = max === min ? 0.5 : ((car[key] as number) - min) / (max - min);
  });
  return row;
});

export function ParallelCoordinatesExample(): JSX.Element {
  return (
    <div>
      <h2>Parallel Coordinates</h2>
      <p>
        One polyline per car, crossing an axis per specification. Arrow left and
        right along a car to hear where it sits on each variable; arrow up and
        down to rank the cars on the variable you are on. Two cars whose pitches
        swap between adjacent axes are the crossing lines that mean negative
        correlation.
      </p>
      <MaidrRecharts
        id="parallel-example"
        title="Cars by Specification"
        subtitle="Economy, power and weight"
        data={cars}
        chartType="parallel"
        xKey="car"
        parallelConfig={{ dimensions: [...dimensions], labelKey: 'car' }}
        xLabel="Variable"
        yLabel="Value"
      >
        <LineChart width={600} height={350} data={axisRows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="axis" />
          {/* The drawn scale is the normalised one; MAIDR announces the raw values. */}
          <YAxis domain={[0, 1]} tickFormatter={() => ''} />
          <Tooltip />
          <Legend />
          {cars.map((car, index) => (
            <Line
              key={car.car}
              type="linear"
              dataKey={`obs${index}`}
              name={car.car}
              stroke={['#8884d8', '#82ca9d', '#ffc658', '#ff7f7f', '#8dd1e1'][index]}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </MaidrRecharts>
    </div>
  );
}
