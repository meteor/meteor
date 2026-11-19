import { page } from '@rstest/browser';

test('Browser Mode runs in real Chromium with locator and snapshot support', async () => {
  expect(process.env.METEOR_RSTEST_SERVER).toBe('false');
  expect(process.env.METEOR_RSTEST_CLIENT).toBe('true');
  expect(process.env.METEOR_RSTEST_ARCHITECTURES).toBe('web.browser');
  document.body.innerHTML = [
    '<main>',
    '<h1>Meteor Browser Mode</h1>',
    '<button type="button">Count: 0</button>',
    '</main>',
  ].join('');
  let count = 0;
  document.querySelector('button').addEventListener('click', event => {
    count += 1;
    event.currentTarget.textContent = `Count: ${count}`;
  });

  await expect.element(page.getByRole('heading', { name: 'Meteor Browser Mode' })).toBeVisible();
  const button = page.getByRole('button', { name: 'Count: 0' });
  await expect.element(button).toBeVisible();
  await button.click();
  await expect.element(page.getByRole('button', { name: 'Count: 1' })).toBeVisible();
  expect(document.querySelector('main').innerHTML).toMatchInlineSnapshot(
    `"<h1>Meteor Browser Mode</h1><button type=\"button\">Count: 1</button>"`,
  );
  expect(navigator.userAgent).toMatch(/Chrome/);
});
