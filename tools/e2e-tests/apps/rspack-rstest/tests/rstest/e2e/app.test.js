import { expect, test } from '@rstest/playwright';

test('full-app Rstest Playwright drives Meteor-owned app lifecycle', async ({ page }) => {
  const baseUrl = process.env.METEOR_RSTEST_BASE_URL;
  expect(baseUrl).toBeTruthy();

  await page.goto(baseUrl);
  await expect(page).toHaveTitle(/rspack-rstest-e2e/i);
  await expect(page.getByRole('heading', { name: 'Meteor Rstest E2E' })).toBeVisible();
  await expect(page.getByTestId('runtime')).toHaveText('Meteor client ready');
});
