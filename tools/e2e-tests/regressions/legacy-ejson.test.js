import fs from 'fs-extra';
import path from 'path';
import {
  buildMeteorApp,
  cleanupTempDir,
  getFreePort,
  runBuiltApp,
  runMeteorCommand,
  setupMeteorApp,
} from '../helpers';
import { linkLocalRspack } from '../test-helpers';

const legacyUserAgent =
  'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko';

describe('Regressions / Legacy production EJSON /', () => {
  let appDir;
  let buildOutputDir;
  let builtApp;
  const contexts = [];

  beforeEach(async () => {
    ({ tempDir: appDir } = await setupMeteorApp('source-maps'));
    const pkg = await fs.readJson(path.join(appDir, 'package.json'));
    // An absent modern key enables the default SWC transpiler and minifier.
    // SWC 1.15.3 truncated EJSON.equals only with Meteor's legacy options.
    delete pkg.meteor.modern;
    await fs.writeJson(path.join(appDir, 'package.json'), pkg, { spaces: 2 });
    await fs.appendFile(path.join(appDir, '.meteor/packages'), '\nejson\ntracker\n');
    await fs.appendFile(path.join(appDir, 'client/main.ts'), `
import { EJSON } from 'meteor/ejson';
import { Meteor } from 'meteor/meteor';
import { Tracker } from 'meteor/tracker';
globalThis.ejsonRegression = { EJSON, Meteor, Tracker };
`);
    await fs.appendFile(path.join(appDir, 'server/main.ts'), `
import { Meteor } from 'meteor/meteor';
Meteor.publish('legacy-ejson', function () { this.ready(); });
`);
  }, 300000);

  afterEach(async () => {
    for (const context of contexts.splice(0)) await context.close();
    if (builtApp) await builtApp.stop();
    if (appDir) await cleanupTempDir(appDir);
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    builtApp = null;
    buildOutputDir = null;
  });

  test.each(['default', 'Rspack'])(
    '%s bundler preserves object equality and reuses subscriptions in built browser programs',
    async bundler => {
      if (bundler === 'Rspack') {
        await runMeteorCommand('add', ['rspack'], appDir, { checkExitCode: true });
        await linkLocalRspack(appDir);
      }
      ({ buildOutputDir } = await buildMeteorApp(appDir, {
        commandOptions: ['--directory', '--server-only'],
      }));
      const port = await getFreePort();
      // This fixture's publication does not use Mongo.
      builtApp = await runBuiltApp(buildOutputDir, {
        port,
        mongoUrl: 'mongodb://127.0.0.1:27017/unused',
      });

      for (const legacy of [false, true]) {
        const context = await browser.newContext(
          legacy ? { userAgent: legacyUserAgent } : {},
        );
        contexts.push(context);
        const page = await context.newPage();
        await page.goto(`http://localhost:${port}/`);
        await page.waitForFunction(() => globalThis.ejsonRegression);
        expect(await page.evaluate(() => __meteor_runtime_config__.isModern))
          .toBe(!legacy);
        const equality = await page.evaluate(() => {
          const { EJSON } = ejsonRegression;
          return [
            EJSON.equals({ a: 1 }, { a: 1 }),
            EJSON.equals({ a: 1 }, { a: 2 }),
            EJSON.equals({ nested: [{ a: 1 }] }, { nested: [{ a: 1 }] }),
            EJSON.equals({ a: 1, b: 2 }, { b: 2, a: 1 }),
            EJSON.equals({ a: 1, b: 2 }, { b: 2, a: 1 }, { keyOrderSensitive: true }),
          ];
        });
        expect({ legacy, equality })
          .toEqual({ legacy, equality: [true, false, true, true, false] });

        await page.evaluate(() => {
          const { Meteor, Tracker } = ejsonRegression;
          ejsonRegression.ids = [];
          ejsonRegression.computation = Tracker.autorun(() => {
            const handle = Meteor.subscribe('legacy-ejson', { conferenceId: 'event' });
            ejsonRegression.ids.push(handle.subscriptionId);
            ejsonRegression.handle = handle;
          });
        });
        await page.waitForFunction(() => ejsonRegression.handle.ready());
        for (let rerun = 0; rerun < 3; rerun++) {
          await page.evaluate(() => {
            ejsonRegression.computation.invalidate();
            ejsonRegression.Tracker.flush();
          });
        }
        expect(await page.evaluate(() => ({
          runs: ejsonRegression.ids.length,
          subscriptions: new Set(ejsonRegression.ids).size,
          ready: ejsonRegression.handle.ready(),
        }))).toEqual({ runs: 4, subscriptions: 1, ready: true });
        await page.evaluate(() => ejsonRegression.computation.stop());
      }
    },
    600000,
  );
});
