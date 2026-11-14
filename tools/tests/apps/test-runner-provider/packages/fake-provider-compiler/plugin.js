const options = Plugin.getTestRunnerBuildOptions();

if (global.testCommandMetadata && (!options || options.ready !== true)) {
  throw new Error(
    'Provider dependency plugin initialized before test-runner context.'
  );
}
