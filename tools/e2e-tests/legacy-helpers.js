export const legacyUserAgent = 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko';

export async function assertBrowserEntrypoints(url, { isTest = false } = {}) {
  // A legacy user agent exercises Meteor's program selection in Chromium.
  // The separate ES5 parse check validates the fixture's emitted syntax.
  for (const { options, message, isModern } of [
    { options: {}, message: 'architecture-modern-entry', isModern: true },
    {
      options: {
        userAgent: legacyUserAgent,
      },
      message: 'architecture-legacy-entry / missing',
      isModern: false,
    },
  ]) {
    const testPage = await browser.newPage(options);
    const browserErrors = [];
    testPage.on('pageerror', error => browserErrors.push(error.message));
    testPage.on('response', response => {
      if (response.status() >= 400 && /\.(?:js|css|svg)(?:\?|$)/.test(response.url())) {
        browserErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    try {
      await testPage.goto(url);
      try {
        await testPage.waitForSelector('#architecture-entry[data-rspack]');
      } catch (error) {
        throw new Error(`${isModern ? 'Modern' : 'Legacy'} entry failed: ${browserErrors.join('; ')}\n${error.message}`);
      }
      expect(await testPage.textContent('#architecture-entry')).toBe(message);
      expect(await testPage.getAttribute('#architecture-entry', 'data-rspack')).toBe(
        isModern ? 'client' : 'RSPACK LOADER / web.browser.legacy'
      );
      expect(await testPage.evaluate(() => Meteor.isModern)).toBe(isModern);
      const color = await testPage.$eval('#architecture-entry', element => getComputedStyle(element).color);
      if (isModern) {
        expect(color).not.toBe('rgb(12, 34, 56)');
      } else {
        expect(color).toBe('rgb(12, 34, 56)');
        await testPage.waitForFunction(() => document.getElementById('legacy-badge')?.naturalWidth > 0);
      }
      if (isTest) {
        await testPage.waitForFunction(() => window.testsDone);
        expect(await testPage.evaluate(() => window.testFailures)).toBe(0);
        if (!isModern) {
          expect(await testPage.getAttribute('html', 'data-legacy-test')).toBe('passed');
        }
      }
      expect(browserErrors).toEqual([]);
    } finally {
      await testPage.close();
    }
  }
}
