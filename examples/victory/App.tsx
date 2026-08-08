import type { JSX } from 'react';
import { useState } from 'react';
import { BarChartExample } from './examples/BarChartExample';
import { BoxPlotExample } from './examples/BoxPlotExample';
import { CandlestickExample } from './examples/CandlestickExample';
import { HistogramExample } from './examples/HistogramExample';
import { LineChartExample } from './examples/LineChartExample';
import { MultiPanelExample } from './examples/MultiPanelExample';
import { ScatterChartExample } from './examples/ScatterChartExample';
import { StackedBarExample } from './examples/StackedBarExample';

const examples: { name: string; component: () => JSX.Element }[] = [
  { name: 'Bar Chart', component: BarChartExample },
  { name: 'Line Chart', component: LineChartExample },
  { name: 'Scatter Chart', component: ScatterChartExample },
  { name: 'Stacked Bar', component: StackedBarExample },
  { name: 'Histogram', component: HistogramExample },
  { name: 'Box Plot', component: BoxPlotExample },
  { name: 'Candlestick', component: CandlestickExample },
  { name: 'Multi-Panel', component: MultiPanelExample },
];

export function App(): JSX.Element {
  const [selected, setSelected] = useState(0);
  const Example = examples[selected].component;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <h1>MAIDR Victory Examples</h1>
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
