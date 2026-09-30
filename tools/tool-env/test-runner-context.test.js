const assert = require('node:assert/strict');
const test = require('node:test');

const {
  clearTestRunnerContext,
  getTestRunnerBuildOptionsFingerprint,
  getTestRunnerIsobuildOptions,
  sameTestRunnerBuildOptionsFingerprint,
  setTestRunnerContext,
} = require('./test-runner-context.js');

test('legacy preloaded Isopack fingerprint reuses disabled ordinary builds', t => {
  t.after(clearTestRunnerContext);
  clearTestRunnerContext();

  assert.equal(typeof sameTestRunnerBuildOptionsFingerprint, 'function');
  assert.equal(
    sameTestRunnerBuildOptionsFingerprint(undefined, 'legacy-package'),
    true,
  );

  setTestRunnerContext({
    providerId: 'example',
    buildPluginOptions: {
      'legacy-package': { coverageGeneration: 'generation-a' },
    },
  });
  assert.equal(
    sameTestRunnerBuildOptionsFingerprint(undefined, 'legacy-package'),
    false,
  );
});

test('test-runner build fingerprint separates coverage generations and disabled builds', t => {
  t.after(clearTestRunnerContext);
  const disabled = getTestRunnerBuildOptionsFingerprint('local:cards');

  setTestRunnerContext({
    providerId: 'example',
    buildPluginDependencies: { 'local:cards': ['example-compiler'] },
    buildPluginOptions: {
      'example-compiler': {
        instrumentation: {
          cacheKey: 'generation-a',
        },
      },
    },
  });
  const generationA = getTestRunnerBuildOptionsFingerprint('local:cards');
  assert.equal(
    getTestRunnerBuildOptionsFingerprint('unrelated'),
    disabled,
  );

  setTestRunnerContext({
    providerId: 'example',
    buildPluginDependencies: { 'local:cards': ['example-compiler'] },
    buildPluginOptions: {
      'example-compiler': {
        instrumentation: {
          cacheKey: 'generation-b',
        },
      },
    },
  });
  const generationB = getTestRunnerBuildOptionsFingerprint('local:cards');

  clearTestRunnerContext();
  assert.notEqual(generationA, generationB);
  assert.notEqual(generationA, disabled);
  assert.equal(getTestRunnerBuildOptionsFingerprint('local:cards'), disabled);
});

test('test-runner build fingerprint follows options owned by the build plugin', t => {
  t.after(clearTestRunnerContext);

  setTestRunnerContext({
    providerId: 'example',
    buildPluginOptions: {
      rspack: { context: { coverageGeneration: 'generation-a' } },
    },
  });
  const generationA = getTestRunnerBuildOptionsFingerprint('rspack');

  setTestRunnerContext({
    providerId: 'example',
    buildPluginOptions: {
      rspack: { context: { coverageGeneration: 'generation-b' } },
    },
  });
  const generationB = getTestRunnerBuildOptionsFingerprint('rspack');

  assert.notEqual(generationA, null);
  assert.notEqual(generationA, generationB);
  assert.equal(getTestRunnerBuildOptionsFingerprint('unrelated'), null);
});

test('Isobuild options are immutable and separate rewritten modules from ordinary builds', t => {
  t.after(clearTestRunnerContext);
  clearTestRunnerContext();
  const input = {
    lazyTestPackages: true,
    moduleReplacements: [{ module: 'example/index.js', source: 'export const test = 1;' }],
  };
  assert.deepEqual(getTestRunnerIsobuildOptions(), {});
  setTestRunnerContext({ isobuildOptions: input });
  const first = getTestRunnerBuildOptionsFingerprint('example-package');
  input.moduleReplacements[0].source = 'export const test = 2;';
  assert.equal(getTestRunnerIsobuildOptions().moduleReplacements[0].source,
    'export const test = 1;');
  assert.equal(Object.isFrozen(getTestRunnerIsobuildOptions().moduleReplacements[0]), true);
  setTestRunnerContext({ isobuildOptions: input });
  assert.notEqual(getTestRunnerBuildOptionsFingerprint('example-package'), first);
  clearTestRunnerContext();
  assert.equal(getTestRunnerBuildOptionsFingerprint('example-package'), null);
});

test('build option fingerprints do not interpret a compiler-specific option schema', t => {
  t.after(clearTestRunnerContext);
  setTestRunnerContext({
    buildPluginOptions: {
      'example-compiler': { sourceTransforms: { includePackages: ['local:cards'] } },
    },
  });
  assert.equal(getTestRunnerBuildOptionsFingerprint('local:cards'), null);
});
