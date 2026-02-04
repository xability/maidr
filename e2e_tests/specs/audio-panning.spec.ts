import { expect, test } from '@playwright/test';

/**
 * Test to verify audio panning is smooth across 11+ data points.
 * Opens a smooth plot and navigates through points, capturing console logs
 * to verify panning values increase smoothly from left (-1) to right (1).
 */
test('Audio panning should be smooth across all data points', async ({ page }) => {
  // Capture all console messages
  const consoleLogs: Array<{ type: string; message: string }> = [];

  page.on('console', msg => {
    consoleLogs.push({
      type: msg.type(),
      message: msg.text(),
    });
  });

  // Navigate to the smoothplot example
  await page.goto('/examples/smoothplot.html', { waitUntil: 'networkidle' });

  // Wait for MAIDR to load
  await page.waitForTimeout(1000);

  // Get initial data to understand plot dimensions
  const maidrData = await page.evaluate(() => {
    return (window as any).maidr?.state?.value?.trace?.audio?.panning;
  });

  if (!maidrData) {
    throw new Error('Could not access MAIDR audio panning data');
  }

  console.log('Initial panning data:', maidrData);

  // Navigate through multiple points using arrow keys
  // Starting from position 0, go right through all points
  const pointsToNavigate = 15; // Navigate through 15 points to ensure we see the full range

  for (let i = 0; i < pointsToNavigate; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200); // Wait for audio to play
  }

  // Parse console logs to extract panning information
  const panningLogs = consoleLogs.filter(log =>
    log.message.includes('playSmooth:') || log.message.includes('playTone:')
  );

  console.log('\n=== Panning Logs ===');
  console.log('Total logs captured:', panningLogs.length);

  if (panningLogs.length === 0) {
    throw new Error('No panning logs captured. Debug logs may not be enabled.');
  }

  // Extract interpolated xPos values from logs
  const xPosValues: number[] = [];
  const colValues: number[] = [];
  const colsValues: number[] = [];

  panningLogs.forEach(log => {
    console.log(log.message);

    // Parse: "playSmooth: col=5, cols=11, interpolated xPos=0.0"
    const colMatch = log.message.match(/col=(\d+)/);
    const colsMatch = log.message.match(/cols=(\d+)/);
    const xPosMatch = log.message.match(/interpolated x(?:Pos|=([^,]+))/);

    if (colMatch) colValues.push(parseInt(colMatch[1]));
    if (colsMatch) colsValues.push(parseInt(colsMatch[1]));

    // Handle both "xPos=" and "x=" formats
    let xValue = null;
    if (log.message.includes('xPos=')) {
      const match = log.message.match(/xPos=(-?\d+\.?\d*)/);
      if (match) xValue = parseFloat(match[1]);
    } else {
      const match = log.message.match(/x=(-?\d+\.?\d*)/);
      if (match) xValue = parseFloat(match[1]);
    }

    if (xValue !== null) {
      xPosValues.push(xValue);
    }
  });

  console.log('\n=== Extracted Values ===');
  console.log('Column indices:', colValues);
  console.log('Cols values:', colsValues);
  console.log('X Position values:', xPosValues);

  // Verify that cols is consistently 11 (or the correct number)
  const uniqueCols = [...new Set(colsValues)];
  expect(uniqueCols.length).toBeLessThanOrEqual(3,
    `Expected cols to be consistent, got ${uniqueCols.length} different values: ${uniqueCols}`);

  const colsValue = uniqueCols[0];
  expect(colsValue).toBeGreaterThanOrEqual(11,
    'Expected at least 11 data points (cols >= 11)');

  // Verify xPos values are smooth and monotonically increasing (or as expected)
  // For smooth panning, consecutive xPos values should differ smoothly
  if (xPosValues.length >= 3) {
    let prevX = xPosValues[0];
    let discreteJumps = 0;

    for (let i = 1; i < xPosValues.length; i++) {
      const diff = Math.abs(xPosValues[i] - xPosValues[i - 1]);

      // A smooth panning should have increments of size ~2/cols
      const expectedIncrement = 2 / (colsValue - 1); // -1 to 1 range over cols points
      const maxAllowedDiff = expectedIncrement * 1.5; // Allow some tolerance

      if (diff > maxAllowedDiff && diff > 0.01) {
        discreteJumps++;
        console.log(`Large jump detected at index ${i}: ${prevX} -> ${xPosValues[i]} (diff=${diff.toFixed(3)})`);
      }
      prevX = xPosValues[i];
    }

    console.log(`\nDiscrete jumps greater than expected: ${discreteJumps}`);

    // With smooth panning, we shouldn't have more than 1-2 large jumps
    // (they might occur at beginning/end or due to rounding)
    expect(discreteJumps).toBeLessThan(3,
      `Expected smooth panning but detected ${discreteJumps} discrete jumps. ` +
      `X values should increase smoothly, not jump to 3 fixed zones.`);
  }

  // Verify range is used: should have values near -1 (left), 0 (center), and 1 (right)
  const minX = Math.min(...xPosValues);
  const maxX = Math.max(...xPosValues);

  console.log(`\nX value range: ${minX.toFixed(3)} to ${maxX.toFixed(3)}`);

  expect(minX).toBeLessThan(-0.5,
    'Expected to have panning values on the left side (< -0.5)');
  expect(maxX).toBeGreaterThan(0.5,
    'Expected to have panning values on the right side (> 0.5)');

  // Verify all 11 positions don't cluster into just 3 zones
  const uniqueXPos = new Set(xPosValues.map(x => x.toFixed(2))); // Round to 2 decimals
  expect(uniqueXPos.size).toBeGreaterThan(3,
    `Expected more than 3 distinct panning positions, got ${uniqueXPos.size}. ` +
    `This suggests discrete bucketing (left/center/right) instead of smooth panning. ` +
    `Unique values: ${Array.from(uniqueXPos).sort()}`);

  console.log(`\nTest passed! Found ${uniqueXPos.size} distinct panning positions.`);
  console.log('Unique X positions:', Array.from(uniqueXPos).sort());
});
