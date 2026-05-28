import type { JSX } from 'react';
import { VictoryAxis, VictoryCandlestick, VictoryChart } from 'victory';
import { MaidrVictory } from '../../../src/adapters/victory/MaidrVictory';

// OHLC data. Highlighting is intentionally skipped for candlestick charts
// (audio, text, and braille still work).
const data = [
  { x: 'Mon', open: 100, close: 110, high: 115, low: 98 },
  { x: 'Tue', open: 110, close: 105, high: 112, low: 102 },
  { x: 'Wed', open: 105, close: 120, high: 122, low: 104 },
  { x: 'Thu', open: 120, close: 118, high: 125, low: 116 },
  { x: 'Fri', open: 118, close: 130, high: 132, low: 117 },
];

export function CandlestickExample(): JSX.Element {
  return (
    <div>
      <h2>Candlestick</h2>
      <p>Candlestick chart of weekly price movement.</p>
      <MaidrVictory
        id="victory-candlestick"
        title="Weekly Price"
      >
        <VictoryChart domainPadding={24}>
          <VictoryAxis label="Day" />
          <VictoryAxis dependentAxis label="Price ($)" />
          <VictoryCandlestick data={data} />
        </VictoryChart>
      </MaidrVictory>
    </div>
  );
}
