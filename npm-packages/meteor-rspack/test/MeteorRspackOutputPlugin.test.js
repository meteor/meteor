const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  extractDelegatedFiles,
} = require('../plugins/MeteorRspackOutputPlugin.js');

test('reports only entry-folder files that Rspack actually compiled', () => {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rspack-delegated-'));
  try {
    fs.writeFileSync(
      path.join(appRoot, 'package.json'),
      JSON.stringify({
        meteor: {
          mainModule: {
            client: 'client/main.js',
            server: 'server/main.js',
          },
        },
      })
    );

    const compiler = {
      options: {
        context: appRoot,
        module: {
          rules: [{ test: /\.css$/ }, { test: /\.html$/ }],
        },
      },
    };
    const stats = {
      compilation: {
        modules: [
          { resource: path.join(appRoot, 'client', 'main.css') },
          { resource: path.join(appRoot, 'client', 'widgets', 'nested.html') },
          { resource: path.join(appRoot, 'imports', 'ignored.css') },
          { resource: path.join(appRoot, 'client', 'main.js') },
        ],
      },
    };

    assert.deepEqual(extractDelegatedFiles(stats, compiler), [
      'client/main.css',
    ]);
  } finally {
    fs.rmSync(appRoot, { recursive: true, force: true });
  }
});
