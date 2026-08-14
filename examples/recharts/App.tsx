import type { JSX } from 'react';
import { useState } from 'react';
import { BarChartExample } from './examples/BarChartExample';
import { StackedBarExample } from './examples/StackedBarExample';
import { DodgedBarExample } from './examples/DodgedBarExample';
import { NormalizedBarExample } from './examples/NormalizedBarExample';
import { DivergingBarExample } from './examples/DivergingBarExample';
import { WaterfallExample } from './examples/WaterfallExample';
import { DumbbellExample } from './examples/DumbbellExample';
import { GanttExample } from './examples/GanttExample';
import { GaugeExample } from './examples/GaugeExample';
import { DotPlotExample } from './examples/DotPlotExample';
import { LollipopExample } from './examples/LollipopExample';
import { FunnelChartExample } from './examples/FunnelChartExample';
import { HistogramExample } from './examples/HistogramExample';
import { LineChartExample } from './examples/LineChartExample';
import { AreaChartExample } from './examples/AreaChartExample';
import { StackedAreaExample } from './examples/StackedAreaExample';
import { NormalizedAreaExample } from './examples/NormalizedAreaExample';
import { RadarChartExample } from './examples/RadarChartExample';
import { BumpChartExample } from './examples/BumpChartExample';
import { SurvivalCurveExample } from './examples/SurvivalCurveExample';
import { ScatterChartExample } from './examples/ScatterChartExample';
import { VolcanoPlotExample } from './examples/VolcanoPlotExample';
import { ManhattanPlotExample } from './examples/ManhattanPlotExample';
import { ErrorBarExample } from './examples/ErrorBarExample';
import { ForestPlotExample } from './examples/ForestPlotExample';
import { AlluvialExample } from './examples/AlluvialExample';
import { TreemapExample } from './examples/TreemapExample';
import { SunburstExample } from './examples/SunburstExample';
import { ComposedChartExample } from './examples/ComposedChartExample';
import { FacetExample } from './examples/FacetExample';

const examples: { name: string; component: () => JSX.Element }[] = [
  { name: 'Bar Chart', component: BarChartExample },
  { name: 'Stacked Bar', component: StackedBarExample },
  { name: 'Dodged Bar', component: DodgedBarExample },
  { name: 'Normalized Bar', component: NormalizedBarExample },
  { name: 'Diverging Bar', component: DivergingBarExample },
  { name: 'Waterfall', component: WaterfallExample },
  { name: 'Dumbbell', component: DumbbellExample },
  { name: 'Gantt', component: GanttExample },
  { name: 'Gauge', component: GaugeExample },
  { name: 'Dot Plot', component: DotPlotExample },
  { name: 'Lollipop', component: LollipopExample },
  { name: 'Funnel', component: FunnelChartExample },
  { name: 'Histogram', component: HistogramExample },
  { name: 'Line Chart', component: LineChartExample },
  { name: 'Area Chart', component: AreaChartExample },
  { name: 'Stacked Area', component: StackedAreaExample },
  { name: 'Normalized Area', component: NormalizedAreaExample },
  { name: 'Radar Chart', component: RadarChartExample },
  { name: 'Bump Chart', component: BumpChartExample },
  { name: 'Survival Curve', component: SurvivalCurveExample },
  { name: 'Scatter Chart', component: ScatterChartExample },
  { name: 'Volcano Plot', component: VolcanoPlotExample },
  { name: 'Manhattan Plot', component: ManhattanPlotExample },
  { name: 'Error Bars', component: ErrorBarExample },
  { name: 'Forest Plot', component: ForestPlotExample },
  { name: 'Alluvial', component: AlluvialExample },
  { name: 'Treemap', component: TreemapExample },
  { name: 'Sunburst', component: SunburstExample },
  { name: 'Composed Chart', component: ComposedChartExample },
  { name: 'Faceted (Multi-Panel)', component: FacetExample },
];

export function App(): JSX.Element {
  const [selected, setSelected] = useState(0);
  const Example = examples[selected].component;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h1>MAIDR Recharts Examples</h1>
      <p style={{ color: '#666' }}>
        Click a chart, then use arrow keys to navigate. Press Escape to exit.
      </p>

      <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {examples.map((ex, i) => (
          <button
            key={ex.name}
            onClick={() => setSelected(i)}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              background: i === selected ? '#1976d2' : '#fff',
              color: i === selected ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: i === selected ? 600 : 400,
            }}
          >
            {ex.name}
          </button>
        ))}
      </nav>

      <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '24px' }}>
        <Example />
      </div>
    </div>
  );
}
