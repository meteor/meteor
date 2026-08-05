const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  assertPureSource,
  classifyTestFile,
  createGeneratedProjects,
  directMeteorRequests,
} = require('../src/config/projects.js');

const appRoot = path.resolve('/tmp/meteor-rstest-app');

test('generated projects keep compiler ownership explicit', () => {
  const projects = createGeneratedProjects({ appRoot });

  assert.deepEqual(
    projects.map(project => [project.name, project.meteor.compiler]),
    [
      ['meteor-pure-server', 'rstest'],
      ['meteor-pure-client', 'rstest'],
      ['meteor-browser', 'rstest'],
      ['meteor-runtime-server', 'meteor'],
      ['meteor-runtime-client', 'meteor'],
      ['meteor-e2e', 'rstest'],
    ]
  );
  assert.equal(
    projects.find(project => project.name === 'meteor-runtime-server').root,
    path.join(appRoot, 'tests/rstest/runtime/server')
  );
});

test('file classification never silently moves native roots between compilers', () => {
  assert.equal(
    classifyTestFile(path.join(appRoot, 'tests/rstest/pure/server/math.test.js'), appRoot).owner,
    'pure-server'
  );
  assert.equal(
    classifyTestFile(path.join(appRoot, 'tests/rstest/runtime/client/ddp.test.js'), appRoot).owner,
    'runtime-client'
  );
  assert.equal(
    classifyTestFile(path.join(appRoot, 'imports/api/links.test.js'), appRoot).owner,
    'compatibility'
  );
});

test('direct Meteor import in pure source fails with runtime-project guidance', () => {
  assert.throws(
    () => assertPureSource({
      filePath: path.join(appRoot, 'tests/rstest/pure/server/mongo.test.js'),
      source: "import { Mongo } from 'meteor/mongo';",
    }),
    error => {
      assert.equal(error.code, 'RSTEST_RUNTIME_PROJECT_REQUIRED');
      assert.match(error.message, /tests\/rstest\/runtime\/server/);
      assert.match(error.message, /meteor\/mongo/);
      return true;
    }
  );
});

test('explicit pure alias permits intentionally mocked Meteor imports', () => {
  assert.doesNotThrow(() => assertPureSource({
    filePath: path.join(appRoot, 'tests/rstest/pure/server/mocked.test.js'),
    source: "import { Meteor } from 'meteor/meteor';",
    aliases: { 'meteor/meteor': path.join(appRoot, 'tests/mocks/meteor.js') },
  }));
});

test('direct import preflight ignores comments and string examples', () => {
  assert.deepEqual(directMeteorRequests(`
    // import { Mongo } from 'meteor/mongo';
    /*
    import { Meteor } from 'meteor/meteor';
    */
    const example = "import('meteor/tracker')";
  `), []);
});
