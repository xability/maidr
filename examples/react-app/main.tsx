import { createRoot } from 'react-dom/client';
import { Maidr } from 'maidr/react';

import { barData, barSvgInnerHTML } from './data/barData';
import { lineData, lineSvgInnerHTML } from './data/lineData';
import { smoothData, smoothSvgInnerHTML } from './data/smoothData';

function BarChart() {
  return (
    <Maidr data={barData}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="720pt"
        height="432pt"
        viewBox="0 0 720 432"
        version="1.1"
        dangerouslySetInnerHTML={{ __html: barSvgInnerHTML }}
      />
    </Maidr>
  );
}

function LineChart() {
  return (
    <Maidr data={lineData}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="1008pt"
        height="504pt"
        viewBox="0 0 1008 504"
        version="1.1"
        dangerouslySetInnerHTML={{ __html: lineSvgInnerHTML }}
      />
    </Maidr>
  );
}

function SmoothChart() {
  return (
    <Maidr data={smoothData}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="432pt"
        height="432pt"
        viewBox="0 0 432 432"
        version="1.1"
        id="a6b8ffb5-9a9d-44be-9151-439a5373e405"
        dangerouslySetInnerHTML={{ __html: smoothSvgInnerHTML }}
      />
    </Maidr>
  );
}

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>MAIDR React Examples</h1>
      <h2>Bar Chart</h2>
      <BarChart />
      <h2>Line Chart</h2>
      <LineChart />
      <h2>Smooth Chart</h2>
      <SmoothChart />
    </div>
  );
}

document.addEventListener('DOMContentLoaded', () => {
  createRoot(document.getElementById('root')!).render(<App />);
});