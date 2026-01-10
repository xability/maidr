import { test } from '@playwright/test';
import { DodgedBarplotPage } from '../page-objects/plots/dodgedBarplot-page';
import { TestConstants } from '../utils/constants';

test('debug review mode', async ({ page }) => {
  // Navigate to the page
  const dodgedBarplotPage = new DodgedBarplotPage(page);
  await dodgedBarplotPage.navigateToDodgedBarplot();
  await dodgedBarplotPage.activateMaidr();

  // Get initial notification text
  const notificationSelector = `#${TestConstants.MAIDR_NOTIFICATION_CONTAINER} ${TestConstants.PARAGRAPH}`;
  let notificationText = await page.locator(notificationSelector).textContent();
  console.log('Initial notification text:', notificationText);

  // Toggle review mode
  await dodgedBarplotPage.toggleReviewMode();

  // Wait a moment for state to update
  await page.waitForTimeout(500);

  // Get notification text after toggle
  notificationText = await page.locator(notificationSelector).textContent();
  console.log('After toggle notification text:', notificationText);

  // Check if it matches expected
  console.log('Expected:', TestConstants.REVIEW_MODE_ON_MESSAGE);
  console.log('Match:', notificationText === TestConstants.REVIEW_MODE_ON_MESSAGE);
});
