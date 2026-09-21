import path from 'path';
import fs from 'fs-extra';
import {
  buildMeteorApp,
  cleanupTempDir,
  setupMeteorApp,
} from '../helpers';

const { linkLocalRspack } = require('../scripts/link-rspack');

async function readProgramJavaScript(buildOutputDir, arch) {
  const programDir = path.join(buildOutputDir, 'bundle', 'programs', arch);
  const { manifest } = await fs.readJson(path.join(programDir, 'program.json'));
  const sources = await Promise.all(
    manifest.filter(file => file.type === 'js').map(file =>
      fs.readFile(path.join(programDir, file.path), 'utf8')
    )
  );
  return sources.join('\n');
}

describe('Regressions / Architecture-specific entrypoints /', () => {
  let tempDir;
  let buildOutputDir;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp('server-only'));
    await fs.outputFile(path.join(tempDir, 'client/modern.ts'),
      'console.log("architecture-modern-entry");\n');
    await fs.outputFile(path.join(tempDir, 'client/legacy.ts'),
      'import { message } from "../imports/legacy-message";\nconsole.log(message);\n');
    await fs.outputFile(path.join(tempDir, 'imports/legacy-message.ts'),
      'export const message: string = "architecture-legacy-entry";\n');
    await fs.outputFile(path.join(tempDir, 'client/cordova.ts'),
      'console.log("architecture-cordova-entry");\n');

    const packagePath = path.join(tempDir, 'package.json');
    const pkg = await fs.readJson(packagePath);
    Object.assign(pkg.meteor.mainModule, {
      client: 'client/modern.ts',
      legacy: 'client/legacy.ts',
      'web.cordova': 'client/cordova.ts',
    });
    await fs.writeJson(packagePath, pkg, { spaces: 2 });
    // Build the Cordova web program without requiring a native SDK.
    await fs.appendFile(path.join(tempDir, '.meteor/platforms'), '\nandroid\n');
    if (process.env.NPM_LINK_RSPACK !== 'false') {
      await linkLocalRspack(tempDir);
    }
  }, 600000);

  afterEach(async () => {
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    buildOutputDir = null;
  });

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  test.each([
    ['production', []],
    ['debug', ['--debug']],
  ])('%s build preserves distinct client entrypoints', async (_mode, flags) => {
    ({ buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only', ...flags],
    }));

    for (const [arch, entry] of [
      ['web.browser', 'modern'],
      ['web.browser.legacy', 'legacy'],
      ['web.cordova', 'cordova'],
    ]) {
      const source = await readProgramJavaScript(buildOutputDir, arch);
      const markers = [...new Set(source.match(/architecture-\w+-entry/g))];
      expect({ arch, markers }).toEqual({
        arch,
        markers: [`architecture-${entry}-entry`],
      });
    }
  }, 300000);

  test.each([
    ['disabled', false, []],
    ['unspecified', undefined, ['architecture-modern-entry']],
  ])('%s architecture entries preserve existing behavior', async (_mode, entry, expected) => {
    const packagePath = path.join(tempDir, 'package.json');
    const pkg = await fs.readJson(packagePath);
    pkg.meteor.mainModule.legacy = entry;
    pkg.meteor.mainModule['web.cordova'] = entry;
    await fs.writeJson(packagePath, pkg, { spaces: 2 });

    ({ buildOutputDir } = await buildMeteorApp(tempDir, {
      commandOptions: ['--directory', '--server-only'],
    }));
    for (const arch of ['web.browser', 'web.browser.legacy', 'web.cordova']) {
      const source = await readProgramJavaScript(buildOutputDir, arch);
      const markers = [...new Set(source.match(/architecture-\w+-entry/g))];
      expect({ arch, markers }).toEqual({
        arch,
        markers: arch === 'web.browser' ? ['architecture-modern-entry'] : expected,
      });
    }
  }, 300000);
});
