import { createHash } from 'crypto';
import execa from 'execa';
import fs from 'fs-extra';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SUBMODULE_PATH = 'packages/non-core/blaze';
const BLAZE_ROOT = path.join(REPO_ROOT, SUBMODULE_PATH);

export async function assertBlazeCheckout(tempDir, { backend = 'jquery', phase } = {}) {
  const pinned = await execa('git', ['rev-parse', `HEAD:${SUBMODULE_PATH}`], { cwd: REPO_ROOT });
  const checkout = await execa('git', ['rev-parse', 'HEAD'], { cwd: BLAZE_ROOT });
  expect(checkout.stdout).toBe(pinned.stdout);

  const changes = await execa('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: BLAZE_ROOT,
  });
  const packageSource = await fs.readFile(path.join(BLAZE_ROOT, 'packages/blaze/package.js'), 'utf8');
  const version = packageSource.match(/version:\s*['"]([^'"]+)['"]/)[1];
  const versions = (await fs.readFile(path.join(tempDir, '.meteor/versions'), 'utf8')).split('\n');
  expect(versions).toContain(`blaze@${version}`);
  expect(versions.some(entry => entry.startsWith('jquery@'))).toBe(backend === 'jquery');

  // The compiler's recorded input path and hash prove that this app built
  // the local dombackend.js, even if a published package has the same version.
  const sourcePath = path.join(BLAZE_ROOT, 'packages/blaze/dombackend.js');
  const sourceHash = createHash('sha1').update(await fs.readFile(sourcePath)).digest('hex');
  const buildInfo = await fs.readJson(path.join(
    tempDir, '.meteor/local/isopacks/blaze/isopack-buildinfo.json'
  ));
  const browserInputs = Object.entries(buildInfo.unibuildDependencies)
    .filter(([name]) => name.startsWith('web.browser'))
    .map(([, inputs]) => inputs.files);
  expect(browserInputs.length).toBeGreaterThan(0);
  for (const inputs of browserInputs) {
    expect(inputs[sourcePath]).toBe(sourceHash);
  }

  await page.waitForFunction(() => Boolean(Package.blaze?.Blaze?._DOMBackend));
  const hasJQuery = await page.evaluate(() => Package.blaze.Blaze._DOMBackend._hasJQuery);
  expect(hasJQuery).toBe(backend === 'jquery');

  console.log('[Blaze E2E source]', JSON.stringify({
    app: path.basename(tempDir),
    phase,
    pinnedCommit: pinned.stdout,
    checkoutCommit: checkout.stdout,
    modified: Boolean(changes.stdout),
    version,
    backend: hasJQuery ? 'jquery' : 'native',
    sourcePath,
    sourceHash,
  }));
}
