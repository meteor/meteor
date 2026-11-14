test('pure client project runs with jsdom', () => {
  document.body.innerHTML = '<button type="button">Meteor</button>';
  expect(document.querySelector('button').textContent).toBe('Meteor');
  expect(typeof window.localStorage).toBe('object');
  expect(process.env.METEOR_RSTEST_SERVER).toBe('false');
  expect(process.env.METEOR_RSTEST_CLIENT).toBe('true');
  expect(process.env.METEOR_RSTEST_ARCHITECTURES).toBe('web.browser');
});
