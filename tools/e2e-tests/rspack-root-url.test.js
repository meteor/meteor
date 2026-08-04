import { testMeteorRspackBundler } from './test-helpers';
import { waitForMeteorOutput } from './helpers';

const PORT = 3160;
const PATH_PREFIX = '/live/';
const ROOT_URL = `http://localhost:${PORT}${PATH_PREFIX}`;

describe('Regressions / Rspack ROOT_URL path prefix /', () => {
  describe('Meteor+Rspack Bundler /', testMeteorRspackBundler({
    appName: 'react',
    port: PORT,
    devServerPort: 18660,
    urlPathPrefix: PATH_PREFIX,
    configFile: 'rspack.config.cjs',
    buildDir: '_build',
    filePaths: {
      client: 'client/main.jsx',
      server: 'server/main.js',
      test: 'tests/main.js',
    },
    env: { ROOT_URL },
    verbose: false,
    customAssertions: {
      afterRun: assertPrefixedRuntime,
      afterRunRebuildClient: async ({ allConsoleLogs }) => {
        await waitForMeteorOutput(
          allConsoleLogs,
          /.*HMR.*Updated modules:.*/
        );
      },
      afterRunProduction: assertPrefixedRuntime,
    },
  }));
});

async function assertPrefixedRuntime({ port, webSocketUrls, browserMessages }) {
  await page.waitForFunction(
    () => window.__rspackE2eLazyValue === 'rspack-dynamic-chunk-loaded'
  );

  const isProduction = await page.evaluate(() => Meteor.isProduction);
  if (!isProduction) {
    const clientBundle = await page.evaluate(async () => {
      const response = await fetch('/live/__rspack__/client-rspack.js');
      return response.text();
    });
    expect(clientBundle).toContain('pathname=%2Flive%2Fws');
    const socketMessages = browserMessages.filter(message =>
      /rspack|webpack-dev-server|websocket/i.test(message)
    );
    const expectedWebSocketUrl = `ws://localhost:${port}/live/ws`;
    if (!webSocketUrls.includes(expectedWebSocketUrl)) {
      throw new Error(
        `Missing ${expectedWebSocketUrl}. Sockets: ${JSON.stringify(webSocketUrls)}. ` +
        `Socket messages: ${JSON.stringify(socketMessages)}`
      );
    }
    expect(browserMessages).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/rspack.*(?:error|disconnect)/i),
    ]));
  }

  const urls = await page.evaluate(() => ({
    scripts: Array.from(document.scripts, script => script.src),
    styles: Array.from(
      document.querySelectorAll('link[rel="stylesheet"]'),
      link => link.href
    ),
    images: Array.from(document.images, image => image.src),
  }));
  const rspackUrls = [...urls.scripts, ...urls.styles, ...urls.images]
    .filter(url => /(?:__rspack__|build-chunks|build-assets)/.test(url));
  expect(rspackUrls.length).toBeGreaterThan(0);
  expect(rspackUrls.every(url => new URL(url).pathname.startsWith('/live/')))
    .toBe(true);

  if (!isProduction) {
    for (const pathname of [
      '/build-chunks/main.css?cache=1',
      '/build-assets/missing.svg?cache=1',
      '/main.fake.hot-update.js?cache=1',
    ]) {
      const response = await fetch(`http://localhost:${port}${pathname}`, {
        redirect: 'manual',
      });
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toMatch(
        /^\/live\/__rspack__\/.+\?cache=1$/
      );
    }

  }
}
