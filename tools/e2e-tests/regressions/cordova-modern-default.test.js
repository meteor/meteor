import path from 'path';
import fs from 'fs-extra';
import {
  buildMeteorApp,
  cleanupTempDir,
  clearBuildArtifacts,
  isRetryAttempt,
  runMeteorCommand,
  setupMeteorApp,
} from '../helpers';

const { linkLocalRspack: _linkLocalRspack } = require('../scripts/link-rspack');
const npmLinkLocalRspack = process.env.NPM_LINK_RSPACK !== 'false';

async function linkLocalRspack(appDir) {
  if (!npmLinkLocalRspack) return;
  await _linkLocalRspack(appDir);
}

describe("Regressions / CordovaModernDefault /", () => {
  let tempDir;
  let appDir;
  let buildOutputDir;

  beforeAll(async () => {
    ({ tempDir } = await setupMeteorApp("react"));
    appDir = tempDir;

    await runMeteorCommand("add", ["rspack"], appDir, { checkExitCode: true });
    await linkLocalRspack(appDir);

    const pkgPath = path.join(appDir, "package.json");
    const pkg = await fs.readJson(pkgPath);
    if (pkg.meteor && Object.prototype.hasOwnProperty.call(pkg.meteor, "modern")) {
      delete pkg.meteor.modern;
      await fs.writeJson(pkgPath, pkg, { spaces: 2 });
    }

    const platformsPath = path.join(appDir, ".meteor", "platforms");
    const platforms = await fs.readFile(platformsPath, "utf8");
    if (!/^android\s*$/m.test(platforms)) {
      await fs.writeFile(
        platformsPath,
        platforms.replace(/\s*$/, "") + "\nandroid\n"
      );
    }
  }, 600000);

  afterAll(async () => {
    if (buildOutputDir) await cleanupTempDir(buildOutputDir);
    if (tempDir) await cleanupTempDir(tempDir);
  });

  beforeEach(async () => {
    if (isRetryAttempt() && appDir) {
      await clearBuildArtifacts(appDir);
    }
  });

  test(
    "web.cordova bundle keeps modern transpile when package.json has no `meteor.modern` field",
    async () => {
      ({ buildOutputDir } = await buildMeteorApp(tempDir, {
        commandOptions: ["--directory", "--server-only"],
        captureOutput: true,
      }));

      const cordovaDir = path.join(
        buildOutputDir,
        "bundle",
        "programs",
        "web.cordova"
      );
      expect(await fs.pathExists(cordovaDir)).toBe(true);

      const jsFiles = (await fs.readdir(cordovaDir)).filter(
        (f) => f.endsWith(".js") && !f.endsWith(".stats.json")
      );
      expect(jsFiles.length).toBeGreaterThan(0);

      let largest = { name: null, size: 0 };
      for (const f of jsFiles) {
        const stat = await fs.stat(path.join(cordovaDir, f));
        if (stat.size > largest.size) {
          largest = { name: f, size: stat.size };
        }
      }
      const bundle = await fs.readFile(
        path.join(cordovaDir, largest.name),
        "utf8"
      );

      const arrowCount = (bundle.match(/=>/g) || []).length;
      expect(arrowCount).toBeGreaterThan(10);

      expect(bundle).not.toMatch(
        /_toConsumableArray|_iterableToArray|createForOfIteratorHelper/
      );
    },
    300000
  );
});
