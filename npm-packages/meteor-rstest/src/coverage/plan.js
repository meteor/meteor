function coverageError(code, message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = code;
  return error;
}

function normalizeFilters(coverage, field) {
  const value = coverage[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
    throw coverageError(
      'METEOR_RSTEST_INVALID_COVERAGE_FILTER',
      `coverage.${field} must contain only string patterns.`,
    );
  }
  return [...value];
}

function coveragePlanFromConfig(config, {
  cliEnabled = false,
  generation,
  root,
  artifactRoot,
  hasMeteorRuntime = false,
}) {
  const coverage = config.coverage === true
    ? {}
    : config.coverage && typeof config.coverage === 'object'
      ? config.coverage
      : {};
  const provider = coverage.provider === undefined ? 'istanbul' : coverage.provider;
  if (provider !== 'istanbul' && provider !== 'v8') {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_UNSUPPORTED',
      'coverage.provider must be either "istanbul" or "v8".',
    );
  }
  const enabled = Boolean(cliEnabled || config.coverage === true || coverage.enabled === true);
  if (enabled && hasMeteorRuntime && provider !== 'istanbul') {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_UNSUPPORTED',
      'Meteor-hosted coverage requires the Istanbul provider; V8 is supported only for native Rstest runs.',
    );
  }
  if (coverage.allowExternal !== undefined && typeof coverage.allowExternal !== 'boolean') {
    throw coverageError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      'coverage.allowExternal must be a boolean.',
    );
  }
  return {
    schemaVersion: 1,
    generation,
    enabled,
    provider,
    root,
    include: normalizeFilters(coverage, 'include'),
    exclude: normalizeFilters(coverage, 'exclude'),
    allowExternal: coverage.allowExternal ?? false,
    artifactRoot,
  };
}

module.exports = { coveragePlanFromConfig };
