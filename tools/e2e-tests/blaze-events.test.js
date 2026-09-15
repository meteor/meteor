import {
  cleanupTempDir,
  killMeteorProcess,
  resetPlaywrightPage,
  runMeteorCommand,
  setupMeteorApp,
  waitForMeteorOutput,
} from './helpers';
import { linkLocalRspack } from './test-helpers';
import { assertBlazeCheckout } from './helpers/blaze-helpers';
import { testEachDataContext } from './helpers/blaze-each-helpers';

const PORT = 3127;
const DEV_SERVER_PORT = '18127';
const SETUP_TIMEOUT = process.env.CI ? 600_000 : 300_000;

describe('BasicBlaze App Bundling / DOM regressions /', () => {
  for (const backend of ['jquery', 'native']) {
    describe(`${backend} backend /`, () => {
      let tempDir;

      beforeAll(async () => {
        ({ tempDir } = await setupMeteorApp('blaze'));
        if (backend === 'native') {
          // Change only the temporary app; the regular Blaze lifecycle keeps
          // its jQuery coverage. A leftover npm dependency does not load it.
          await runMeteorCommand('remove', ['jquery'], tempDir, {
            checkExitCode: true,
          });
        }
        await runMeteorCommand('add', ['rspack'], tempDir, {
          checkExitCode: true,
        });
        await linkLocalRspack(tempDir);
      }, SETUP_TIMEOUT);

      afterAll(async () => {
        await cleanupTempDir(tempDir);
      });

      for (const production of [false, true]) {
        describe(`${production ? 'production' : 'development'} /`, () => {
          let meteorProcess;
          let runtimeErrors;
          const onPageError = error => runtimeErrors.push(error.message);
          const onConsole = message => {
            if (/Exception (from Tracker|in template helper|in callback)/.test(message.text())) {
              runtimeErrors.push(message.text());
            }
          };

          beforeAll(async () => {
            const result = await runMeteorCommand('run', [
              '--port', String(PORT), ...(production ? ['--production'] : []),
            ], tempDir, {
              captureOutput: true,
              env: { RSPACK_DEVSERVER_PORT: DEV_SERVER_PORT },
            });
            meteorProcess = result.meteorProcess;
            await waitForMeteorOutput(result.outputLines, '=> App running at', {
              timeout: SETUP_TIMEOUT - 10_000,
            });
          }, SETUP_TIMEOUT);

          afterAll(async () => {
            await resetPlaywrightPage();
            await killMeteorProcess(meteorProcess);
          });

          beforeEach(async () => {
            runtimeErrors = [];
            page.on('pageerror', onPageError);
            page.on('console', onConsole);
            await page.goto(`http://localhost:${PORT}`);
            await page.waitForSelector('#event-scope-direct .js-hit');
            await page.waitForSelector('#each-deep .each-row');
            // A transitive dependency must never silently turn the native
            // variant into another jQuery run.
            await assertBlazeCheckout(tempDir, {
              backend,
              phase: production ? 'production' : 'development',
            });
          });

          afterEach(() => {
            page.off('pageerror', onPageError);
            page.off('console', onConsole);
            expect(runtimeErrors).toEqual([]);
          });

          test('handles a click owned by the button template (control)', async () => {
            await page.getByRole('button', { name: 'Click Me', exact: true }).click();
            await page.waitForFunction(() => document.body.textContent.includes(
              "You've pressed the button 1 times."
            ));
          });

          test.each([
            ['in an inclusion wrapped inside {{#if}}', '#event-scope-collision'],
            ['on a direct child of a wrapper', '#event-scope-direct'],
          ])('delivers delegated clicks %s (meteor/blaze#512)', async (_, selector) => {
            const count = page.locator(`${selector} .event-count`);
            expect(await count.textContent()).toBe('0');

            // Click the button itself: clicking a nested span bypasses the
            // reported native-backend bug and would give a false pass.
            await page.locator(`${selector} .js-hit`).click();
            await page.waitForFunction(
              root => document.querySelector(`${root} .event-count`).textContent === '1',
              selector,
              { timeout: 5_000 },
            );
            expect(await count.textContent()).toBe('1');
            expect(await page.locator(`${selector} .event-target`).textContent()).toBe('js-hit');
          });

          // Exercise shared #each scheduling in native development; keep only
          // replacement/retained-ID smoke checks in the other app variants.
          testEachDataContext({ comprehensive: backend === 'native' && !production });
        });
      }
    });
  }
});
