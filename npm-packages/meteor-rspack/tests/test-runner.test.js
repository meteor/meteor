const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { loadTestRunnerAdapter } = require('../lib/test-runner.js');

test('ordinary builds do not load a test provider', () => {
  assert.deepEqual(loadTestRunnerAdapter({}, {}), {});
});

test('test providers receive opaque options and the active compiler instance', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-test-adapter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filename = path.join(root, 'adapter.js');
  fs.writeFileSync(filename, `module.exports = ({ options, rspack, projectDir }) => ({
    options, rspack, projectDir,
    finalizeConfig(config) { config.optimization = options.optimization; }
  });`);
  const options = { optimization: { concatenateModules: false } };
  const rspack = {};
  const adapter = loadTestRunnerAdapter({ adapter: filename, options }, {
    projectDir: root,
    rspack,
  });
  assert.equal(adapter.options, options);
  assert.equal(adapter.rspack, rspack);
  assert.equal(adapter.projectDir, root);
  const config = {};
  adapter.finalizeConfig(config);
  assert.deepEqual(config, { optimization: { concatenateModules: false } });
});

test('invalid adapter paths and exports fail before compilation', t => {
  assert.throws(() => loadTestRunnerAdapter({ adapter: './relative.js' }, {}),
    /absolute module path/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meteor-test-adapter-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const invalidExport = path.join(root, 'object.js');
  fs.writeFileSync(invalidExport, 'module.exports = {};');
  assert.throws(() => loadTestRunnerAdapter({ adapter: invalidExport }, {}),
    /export a function/);
  const invalidResult = path.join(root, 'null.js');
  fs.writeFileSync(invalidResult, 'module.exports = () => null;');
  assert.throws(() => loadTestRunnerAdapter({ adapter: invalidResult }, {}),
    /return build options/);
});
