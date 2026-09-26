import type { JSX } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { MaidrNivo } from '../../../src/adapters/nivo/MaidrNivo';

const hours = ['9am', '12pm', '3pm', '6pm', '9pm'];
const visits: Record<string, number[]> = {
  Mon: [12, 30, 25, 40, 18],
  Tue: [15, 28, 22, 35, 20],
  Wed: [10, 33, 27, 44, 22],
  Thu: [14, 31, 29, 38, 25],
  Fri: [9, 26, 20, 30, 41],
};

const data = Object.entries(visits).map(([day, values]) => ({
  id: day,
  data: values.map((y, i) => ({ x: hours[i], y })),
}));

export function HeatmapExample(): JSX.Element {
  return (
    <div>
      <h2>Heatmap</h2>
      <p>Heatmap of site visits by weekday and time of day.</p>
      <MaidrNivo
        id="nivo-heatmap"
        title="Site Visits by Day and Hour"
        type="heatmap"
      >
        <div style={{ width: 700, height: 400 }}>
          <ResponsiveHeatMap
            data={data}
            margin={{ top: 60, right: 30, bottom: 30, left: 70 }}
            axisTop={{ legend: 'Time of day', legendPosition: 'middle', legendOffset: -40 }}
            axisLeft={{ legend: 'Weekday', legendPosition: 'middle', legendOffset: -55 }}
            colors={{ type: 'sequential', scheme: 'blues' }}
          />
        </div>
      </MaidrNivo>
    </div>
  );
}
