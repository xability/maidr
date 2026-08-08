import type { JSX } from 'react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { MaidrRecharts } from '../../../src/adapters/recharts/MaidrRecharts';

const east = [
  { quarter: 'Q1', revenue: 4200 },
  { quarter: 'Q2', revenue: 5800 },
  { quarter: 'Q3', revenue: 3900 },
  { quarter: 'Q4', revenue: 7100 },
];
const west = [
  { quarter: 'Q1', revenue: 3100 },
  { quarter: 'Q2', revenue: 4400 },
  { quarter: 'Q3', revenue: 5200 },
  { quarter: 'Q4', revenue: 4800 },
];
const north = [
  { quarter: 'Q1', revenue: 2500 },
  { quarter: 'Q2', revenue: 2900 },
  { quarter: 'Q3', revenue: 3300 },
  { quarter: 'Q4', revenue: 3600 },
];
const south = [
  { quarter: 'Q1', revenue: 5100 },
  { quarter: 'Q2', revenue: 4700 },
  { quarter: 'Q3', revenue: 6200 },
  { quarter: 'Q4', revenue: 6900 },
];

function RegionChart({ data, fill }: { data: typeof east; fill: string }): JSX.Element {
  return (
    <BarChart width={320} height={220} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="quarter" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="revenue" fill={fill} name="Revenue" />
    </BarChart>
  );
}

/**
 * Multi-panel (faceted) figure: a 2x2 grid of bar charts, one per region.
 *
 * The `subplots` grid describes the panels; the children must be one chart
 * per panel in row-major order (East, West, North, South). Arrow keys move
 * between panels, ENTER drills into a panel, ESCAPE returns to panel
 * navigation.
 */
export function FacetExample(): JSX.Element {
  return (
    <div>
      <h2>Faceted Bar Charts</h2>
      <p>
        Quarterly revenue by region in a 2x2 panel grid. Use arrow keys to
        move between panels, ENTER to enter a panel, ESCAPE to leave it.
      </p>
      <MaidrRecharts
        id="facet-example"
        title="Quarterly Revenue by Region"
        xKey="quarter"
        yKeys={['revenue']}
        xLabel="Quarter"
        yLabel="Revenue ($)"
        subplots={[
          [
            { title: 'East', chartType: 'bar', data: east },
            { title: 'West', chartType: 'bar', data: west },
          ],
          [
            { title: 'North', chartType: 'bar', data: north },
            { title: 'South', chartType: 'bar', data: south },
          ],
        ]}
      >
        <RegionChart data={east} fill="#8884d8" />
        <RegionChart data={west} fill="#82ca9d" />
        <RegionChart data={north} fill="#ffc658" />
        <RegionChart data={south} fill="#ff8042" />
      </MaidrRecharts>
    </div>
  );
}
