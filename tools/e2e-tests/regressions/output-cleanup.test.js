import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  buildMeteorApp,
  cleanupTempDir,
  getFreePort,
  runBuiltApp,
  setupMeteorApp,
  startMongo,
} from '../helpers';

const { linkLocalRspack } = require('../scripts/link-rspack');

describe.each(['ordinary', 'build', 'build-agent'])(
  'Regressions / Rspack output cleanup / %s ancestor /',
  (ancestor) => {
    let rootDir;
    let appDir;
    let buildOutputDir;
    let app;
    let mongo;
    let preservedFiles;
    let symlinks;
    let staleFiles;

    beforeAll(async () => {
      rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meteor-output-cleanup-'));
      ({ tempDir: appDir } = await setupMeteorApp('assets', {
        tempDirSegments: [path.basename(rootDir), ancestor],
      }));
      await fs.appendFile(path.join(appDir, '.meteor/packages'), '\nrspack\n');
      await linkLocalRspack(appDir);

      preservedFiles = {};
      for (const side of ['public', 'private']) {
        for (const relative of [
          'ordinary.txt',
          'docs/build/guide.txt',
          'build-notes/guide.txt',
          'build-assets-test/other-mode.txt',
          'build-chunks-app-test/other-mode.txt',
          'build-assets-local-secondary/other-context.txt',
        ]) {
          const file = `${side}/${relative}`;
          preservedFiles[file] = `Preserve ${file}\n`;
          await fs.outputFile(path.join(appDir, file), preservedFiles[file]);
        }
      }
      preservedFiles['private/app-asset.txt'] = await fs.readFile(
        path.join(appDir, 'private/app-asset.txt'), 'utf8',
      );
      // On a first build there is no _build context for Meteor to clean. The
      // Rspack output cleaner must protect links and their external targets.
      expect(await fs.pathExists(path.join(appDir, '_build'))).toBe(false);
      symlinks = [];
      staleFiles = [];
      for (const side of ['public', 'private']) {
        for (const context of ['build-assets', 'build-chunks/linked']) {
          const target = path.join(rootDir, `${side}-${path.basename(context)}`);
          const targetFile = path.join(target, 'keep.txt');
          const content = `Preserve linked ${side}/${context}\n`;
          const link = path.join(appDir, side, context);
          await fs.outputFile(targetFile, content);
          await fs.ensureDir(path.dirname(link));
          await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
          symlinks.push({ link, targetFile, content });
        }
        const stale = path.join(appDir, side, 'build-chunks/stale.txt');
        await fs.outputFile(stale, 'stale generated output');
        staleFiles.push(stale);
      }
      await fs.appendFile(path.join(appDir, 'server/main.js'), `
import { WebApp } from 'meteor/webapp';
WebApp.handlers.use('/cleanup-private-asset', async (req, res, next) => {
  try {
    res.setHeader('Content-Type', 'text/plain');
    res.end(await Assets.getTextAsync('app-asset.txt'));
  } catch (error) { next(error); }
});
`);
    }, 600000);

    afterAll(async () => {
      if (app) await app.stop();
      if (mongo) await mongo.stop();
      if (buildOutputDir) await cleanupTempDir(buildOutputDir);
      if (rootDir) await cleanupTempDir(rootDir);
    });

    test('production build preserves source assets and other output contexts', async () => {
      ({ buildOutputDir } = await buildMeteorApp(appDir, {
        commandOptions: ['--directory', '--server-only'],
      }));

      const contents = {};
      for (const file of Object.keys(preservedFiles)) {
        contents[file] = await fs.pathExists(path.join(appDir, file))
          ? await fs.readFile(path.join(appDir, file), 'utf8')
          : null;
      }
      console.log('Asset preservation:', JSON.stringify({ ancestor, contents }));
      expect(contents).toEqual(preservedFiles);

      for (const { link, targetFile, content } of symlinks) {
        expect({ targetFile, content: await fs.readFile(targetFile, 'utf8') })
          .toEqual({ targetFile, content });
        expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
      }
      for (const stale of staleFiles) {
        expect({ stale, exists: await fs.pathExists(stale) }).toEqual({ stale, exists: false });
      }

      mongo = await startMongo();
      expect(mongo).not.toBeNull();
      const port = await getFreePort();
      app = await runBuiltApp(buildOutputDir, { port, mongoUrl: mongo.mongoUrl });
      const origin = `http://localhost:${port}`;
      for (const [url, expected] of [
        ['/ordinary.txt', preservedFiles['public/ordinary.txt']],
        ['/docs/build/guide.txt', preservedFiles['public/docs/build/guide.txt']],
        ['/build-notes/guide.txt', preservedFiles['public/build-notes/guide.txt']],
        ['/cleanup-private-asset', preservedFiles['private/app-asset.txt']],
      ]) {
        const response = await fetch(`${origin}${url}`);
        expect({ url, status: response.status }).toEqual({ url, status: 200 });
        expect(await response.text()).toBe(expected);
      }
    }, 300000);
  },
);
