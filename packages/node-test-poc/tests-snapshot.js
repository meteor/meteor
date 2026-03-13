// POC: node:test snapshot testing
// Run with: SERVER_NODE_OPTIONS='--experimental-test-snapshots'
// Update snapshots: SERVER_NODE_OPTIONS='--experimental-test-snapshots --test-update-snapshots'
// Equivalent to Jest's toMatchSnapshot() / toMatchInlineSnapshot()
// Docs: https://nodejs.org/api/test.html#snapshot-testing
//
// Snapshots are stored in a .snapshot file next to the test file.
// NOTE: Stable in Node 23+, experimental in Node 22.

import { describe, it } from 'node:test';

// Skip snapshot tests unless --experimental-test-snapshots is enabled.
// Without the flag, t.assert.snapshot() throws ERR_INVALID_STATE.
const snapshotsEnabled = process.execArgv.some(a => a.includes('test-snapshots'));
const maybeDescribe = snapshotsEnabled ? describe : describe.skip;

// --- Module under test (inline for POC) ---

function buildMeteorPackageExport(pkg) {
  return {
    name: pkg.name,
    version: pkg.version,
    exports: pkg.mainModule ? [pkg.mainModule] : [],
    platforms: pkg.platforms || ['server', 'client'],
    dependencies: Object.keys(pkg.uses || {}),
  };
}

function generateHTML(title, items) {
  return [
    '<!DOCTYPE html>',
    `<html><head><title>${title}</title></head>`,
    '<body>',
    '<ul>',
    ...items.map(i => `  <li>${i}</li>`),
    '</ul>',
    '</body></html>',
  ].join('\n');
}

// --- Snapshot tests ---

maybeDescribe('Snapshots — structured data', () => {
  it('should snapshot a package export object', (t) => {
    const result = buildMeteorPackageExport({
      name: 'my-package',
      version: '1.2.3',
      mainModule: 'index.js',
      uses: { ecmascript: '1.0.0', mongo: '2.0.0' },
    });

    t.assert.snapshot(result);
  });

  it('should snapshot a minimal package', (t) => {
    const result = buildMeteorPackageExport({
      name: 'minimal',
      version: '0.1.0',
    });

    t.assert.snapshot(result);
  });
});

maybeDescribe('Snapshots — string output', () => {
  it('should snapshot generated HTML', (t) => {
    const html = generateHTML('Test Page', ['Item A', 'Item B', 'Item C']);
    t.assert.snapshot(html);
  });
});
