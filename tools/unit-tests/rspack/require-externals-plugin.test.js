const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  RequireExternalsPlugin,
} = require('../../../npm-packages/meteor-rspack/plugins/RequireExtenalsPlugin');

describe('RequireExternalsPlugin global polyfill', () => {
  let tempDir;
  let entryPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-rspack-externals-'));
    entryPath = path.join(tempDir, 'server-meteor.js');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('prepends the global polyfill to an existing entry', () => {
    const existingEntry = 'require("meteor/meteor");\n';
    fs.writeFileSync(entryPath, existingEntry);

    const plugin = new RequireExternalsPlugin({ filePath: entryPath });
    plugin._ensureGlobalThisModule();

    const output = fs.readFileSync(entryPath, 'utf8');
    expect(output).toMatch(
      /^\/\* Polyfill globalThis\.module, exports & module for legacy \*\//
    );
    expect(output.endsWith(existingEntry)).toBe(true);
  });
});
