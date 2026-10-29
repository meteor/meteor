require('../../tool-env/install-babel.js');

const assert = require('assert');
const bundler = require('../../isobuild/bundler.js');
const release = require('../../packaging/release.js');
const files = require('../../fs/files');
const catalog = require('../../packaging/catalog/catalog.js');
const buildmessage = require('../../utils/buildmessage.js');
const isopackets = require('../../tool-env/isopackets.js');
const projectContextModule = require('../../project-context.js');
const safeWatcher = require('../../fs/safe-watcher');
const { makeGlobalAsyncLocalStorage } = require('../../utils/fiber-helpers');

let lastTmpDir = null;
const tmpDir = () => (lastTmpDir = files.mkdtemp());

const doOrThrow = async (f) => {
  let ret;
  const messages = await buildmessage.capture(async () => {
    ret = await f();
  });
  if (messages.hasMessages()) {
    throw Error(messages.formatMessages());
  }
  return ret;
};

const makeProjectContext = async (appName) => {
  const projectDir = files.mkdtemp('test-bundler-devonly-author-packages');
  await files.cp_r(
    files.pathJoin(files.convertToStandardPath(__dirname), appName),
    projectDir,
    { preserveSymlinks: true },
  );
  const projectContext = new projectContextModule.ProjectContext({ projectDir });
  await doOrThrow(() => projectContext.prepareProjectForBuild());
  return projectContext;
};

const runTest = async () => {
  await catalog.official.initialize();

  // The server file of a package is packages/<name>.js, with the colon of an
  // author-prefixed name converted to an underscore.
  const projectContext = await makeProjectContext('app-with-devonly-packages');

  console.log('testing devOnly packages are matched by their exact server file');
  global.currentCommand = { name: 'build' };

  const outputPath = tmpDir();
  const result = await bundler.bundle({
    projectContext,
    outputPath,
    buildOptions: { minifyMode: 'production', buildMode: 'production' },
  });
  assert.strictEqual(result.errors, false, result.errors && result.errors[0]);

  const programJson = JSON.parse(files.readFile(
    files.pathJoin(outputPath, 'programs', 'server', 'program.json'), 'utf8'));
  const loaded = programJson.load.map(item => item.path);

  assert(!loaded.includes('packages/devonly-local-package.js'),
    'a devOnly package should not be loaded in production');
  assert(!loaded.includes('packages/test_devonly-author-package.js'),
    'a devOnly package with an author prefix should not be loaded in production');
  assert(loaded.includes('packages/test_not-devonly-local-package.js'),
    'a package whose name ends like a devOnly package should still be loaded');
};

makeGlobalAsyncLocalStorage().run(
  { name: 'test-bundler-devonly-author-packages.js' },
  async () => {
    if (!files.inCheckout()) {
      throw Error("This test doesn't support non-checkout");
    }

    release.setCurrent(await release.load(null));
    await isopackets.ensureIsopacketsLoadable();

    try {
      await runTest();
    } catch (err) {
      console.log(err.stack);
      console.log(`\nBundle can be found at ${lastTmpDir}`);
      process.exit(1);
    }

    // Allow the process to exit normally, since optimistic file watchers
    // may be keeping the event loop busy.
    safeWatcher.closeAllWatchers();
    process.exit(0);
  }
);
