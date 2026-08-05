import { page } from '@rstest/browser';

test('Browser Mode runs in real Chromium with locator and snapshot support', async () => {
  expect(process.env.METEOR_RSTEST_SERVER).toBe('false');
  expect(process.env.METEOR_RSTEST_CLIENT).toBe('true');
  expect(process.env.METEOR_RSTEST_ARCHITECTURES).toBe('web.browser');
  document.body.innerHTML = '<main><h1>Meteor Browser Mode</h1></main>';

  await expect.element(page.getByRole('heading', { name: 'Meteor Browser Mode' })).toBeVisible();
  expect(document.querySelector('main').innerHTML).toMatchInlineSnapshot(
    `"<h1>Meteor Browser Mode</h1>"`,
  );
  expect(navigator.userAgent).toMatch(/Chrome/);
});
