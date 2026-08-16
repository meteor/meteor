const assert = require('node:assert/strict');
const test = require('node:test');

const {
  clearTestRunnerContext,
  getTestRunnerBuildOptionsFingerprint,
  setTestRunnerContext,
} = require('./test-runner-context.js');

test('test-runner build fingerprint separates coverage generations and disabled builds', t => {
  t.after(clearTestRunnerContext);
  const disabled = getTestRunnerBuildOptionsFingerprint('local:cards');

  setTestRunnerContext({
    providerId: 'rstest',
    buildPluginOptions: {
      'babel-compiler': {
        sourceTransforms: {
          cacheKey: 'generation-a',
          includePackages: ['local:cards'],
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
    providerId: 'rstest',
    buildPluginOptions: {
      'babel-compiler': {
        sourceTransforms: {
          cacheKey: 'generation-b',
          includePackages: ['local:cards'],
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
    providerId: 'rstest',
    buildPluginOptions: {
      rspack: { context: { coverageGeneration: 'generation-a' } },
    },
  });
  const generationA = getTestRunnerBuildOptionsFingerprint('rspack');

  setTestRunnerContext({
    providerId: 'rstest',
    buildPluginOptions: {
      rspack: { context: { coverageGeneration: 'generation-b' } },
    },
  });
  const generationB = getTestRunnerBuildOptionsFingerprint('rspack');

  assert.notEqual(generationA, null);
  assert.notEqual(generationA, generationB);
  assert.equal(getTestRunnerBuildOptionsFingerprint('unrelated'), null);
});
