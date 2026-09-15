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
  // Explicit opt-in for comparing an upstream PR without committing its
  // submodule pointer. Normal local/CI runs still require the committed pin.
  const expectedCommit = process.env.BLAZE_E2E_EXPECTED_COMMIT || pinned.stdout;
  expect(expectedCommit).toMatch(/^[a-f0-9]{40}$/);
  expect(checkout.stdout).toBe(expectedCommit);

  const changes = await execa('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: BLAZE_ROOT,
  });
  expect(changes.stdout).toBe('');
  const packageSource = await fs.readFile(path.join(BLAZE_ROOT, 'packages/blaze/package.js'), 'utf8');
  const version = packageSource.match(/version:\s*['"]([^'"]+)['"]/)[1];
  const versions = (await fs.readFile(path.join(tempDir, '.meteor/versions'), 'utf8')).split('\n');
  expect(versions).toContain(`blaze@${version}`);
  expect(versions.some(entry => entry.startsWith('jquery@'))).toBe(backend === 'jquery');

  // Verify the compiled inputs for both event handling and #each scheduling,
  // including observe-sequence (a separate package with the same-version risk).
  const sources = {};
  for (const [packageName, files] of [
    ['blaze', ['dombackend.js', 'builtins.js', 'view.js']],
    ['observe-sequence', ['observe_sequence.js']],
  ]) {
    const buildInfo = await fs.readJson(path.join(
      tempDir, `.meteor/local/isopacks/${packageName}/isopack-buildinfo.json`
    ));
    const browserInputs = Object.entries(buildInfo.unibuildDependencies)
      .filter(([name]) => name.startsWith('web.browser'))
      .map(([, inputs]) => inputs.files);
    expect(browserInputs.length).toBeGreaterThan(0);
    for (const file of files) {
      const sourcePath = path.join(BLAZE_ROOT, 'packages', packageName, file);
      const sourceHash = createHash('sha1').update(await fs.readFile(sourcePath)).digest('hex');
      for (const inputs of browserInputs) expect(inputs[sourcePath]).toBe(sourceHash);
      sources[sourcePath] = sourceHash;
    }
  }

  await page.waitForFunction(() => Boolean(Package.blaze?.Blaze?._DOMBackend));
  const hasJQuery = await page.evaluate(() => Package.blaze.Blaze._DOMBackend._hasJQuery);
  expect(hasJQuery).toBe(backend === 'jquery');

  console.log('[Blaze E2E source]', JSON.stringify({
    app: path.basename(tempDir),
    phase,
    pinnedCommit: pinned.stdout,
    expectedCommit,
    checkoutCommit: checkout.stdout,
    modified: Boolean(changes.stdout),
    version,
    backend: hasJQuery ? 'jquery' : 'native',
    sources,
  }));
}
