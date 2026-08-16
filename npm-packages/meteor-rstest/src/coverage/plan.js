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

const COVERAGE_ARRAY_FIELDS = new Set(['reporters', 'include', 'exclude']);
const COVERAGE_BOOLEAN_FIELDS = new Set([
  'enabled',
  'reportOnFailure',
  'clean',
  'allowExternal',
]);

function cloneJsonSafe(value, field) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error();
    return JSON.parse(serialized);
  } catch {
    throw coverageError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      `coverage.${field} must contain only JSON-serializable values.`,
    );
  }
}

function parseCliValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value);
  if (/^[{[]/.test(value)) {
    try { return JSON.parse(value); } catch {}
  }
  return value;
}

function coverageCliEntries(args = []) {
  const entries = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (argument === '--coverage') {
      entries.push({ field: 'enabled', value: true, consumed: 1 });
      continue;
    }
    if (argument === '--no-coverage') {
      entries.push({ field: 'enabled', value: false, consumed: 1 });
      continue;
    }
    const match = /^--(no-)?coverage\.([^=]+)(?:=(.*))?$/.exec(argument);
    if (!match) continue;
    const negated = Boolean(match[1]);
    const field = match[2];
    let raw = match[3];
    let consumed = 1;
    const rootField = field.split('.')[0];
    if (raw === undefined && !negated &&
        !COVERAGE_BOOLEAN_FIELDS.has(rootField)) {
      if (index + 1 >= args.length) {
        throw coverageError(
          'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
          `--coverage.${field} requires a value.`,
        );
      }
      raw = String(args[index + 1]);
      consumed = 2;
    }
    entries.push({
      field,
      value: negated ? false : raw === undefined ? true : parseCliValue(raw),
      consumed,
    });
    index += consumed - 1;
  }
  return entries;
}

function stripCoverageCliArgs(args = []) {
  const stripped = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = String(args[index]);
    if (argument === '--coverage' || argument === '--no-coverage') continue;
    const match = /^--(?:no-)?coverage\.([^=]+)(?:=.*)?$/.exec(argument);
    if (!match) {
      stripped.push(args[index]);
      continue;
    }
    const rootField = match[1].split('.')[0];
    if (!argument.includes('=') && !argument.startsWith('--no-') &&
        !COVERAGE_BOOLEAN_FIELDS.has(rootField)) {
      index += 1;
    }
  }
  return stripped;
}

function coveragePolicyFromConfig(config, {
  cliEnabled = false,
  cliArgs = [],
  hasMeteorRuntime = false,
} = {}) {
  const source = config && config.coverage === true
    ? {}
    : config && config.coverage && typeof config.coverage === 'object'
      ? config.coverage
      : {};
  const coverage = { ...source };
  let enabled = Boolean(cliEnabled || config && config.coverage === true ||
    source.enabled === true);
  const replacedArrays = new Set();
  for (const entry of coverageCliEntries(cliArgs)) {
    const [field, ...nested] = entry.field.split('.');
    if (field === 'enabled') {
      enabled = Boolean(entry.value);
      continue;
    }
    if (field === 'thresholds' && nested.length > 0) {
      const thresholds = coverage.thresholds &&
        typeof coverage.thresholds === 'object' &&
        !Array.isArray(coverage.thresholds)
        ? { ...coverage.thresholds }
        : {};
      thresholds[nested.join('.')] = entry.value;
      coverage.thresholds = thresholds;
      continue;
    }
    if (COVERAGE_ARRAY_FIELDS.has(field)) {
      if (!replacedArrays.has(field)) {
        coverage[field] = [];
        replacedArrays.add(field);
      }
      coverage[field].push(entry.value);
      continue;
    }
    coverage[field] = entry.value;
  }
  const provider = coverage.provider === undefined ? 'istanbul' : coverage.provider;
  if (provider !== 'istanbul' && provider !== 'v8') {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_UNSUPPORTED',
      'coverage.provider must be either "istanbul" or "v8".',
    );
  }
  if (enabled && hasMeteorRuntime && provider !== 'istanbul') {
    throw coverageError(
      'METEOR_RSTEST_COVERAGE_PROVIDER_UNSUPPORTED',
      'Meteor-hosted coverage requires the Istanbul provider; V8 is supported only for native Rstest runs.',
    );
  }
  for (const field of ['reportOnFailure', 'clean', 'allowExternal']) {
    if (coverage[field] !== undefined && typeof coverage[field] !== 'boolean') {
      throw coverageError(
        'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
        `coverage.${field} must be a boolean.`,
      );
    }
  }
  if (coverage.reportsDirectory !== undefined &&
      typeof coverage.reportsDirectory !== 'string') {
    throw coverageError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      'coverage.reportsDirectory must be a string.',
    );
  }
  const include = normalizeFilters(coverage, 'include');
  const exclude = normalizeFilters(coverage, 'exclude');
  const reporters = coverage.reporters === undefined
    ? ['text', 'html', 'clover', 'json']
    : cloneJsonSafe(coverage.reporters, 'reporters');
  if (!Array.isArray(reporters)) {
    throw coverageError(
      'METEOR_RSTEST_INVALID_COVERAGE_CONFIG',
      'coverage.reporters must be an array.',
    );
  }
  return {
    schemaVersion: 1,
    enabled,
    provider,
    reporters,
    ...(coverage.thresholds !== undefined && {
      thresholds: cloneJsonSafe(coverage.thresholds, 'thresholds'),
    }),
    reportsDirectory: coverage.reportsDirectory ?? 'coverage',
    include,
    exclude,
    reportOnFailure: coverage.reportOnFailure ?? false,
    clean: coverage.clean ?? true,
    allowExternal: coverage.allowExternal ?? false,
  };
}

function coveragePlanFromConfig(config, {
  cliEnabled = false,
  cliArgs = [],
  generation,
  root,
  artifactRoot,
  hasMeteorRuntime = false,
}) {
  const policy = coveragePolicyFromConfig(config, {
    cliEnabled,
    cliArgs,
    hasMeteorRuntime,
  });
  return {
    schemaVersion: 1,
    generation,
    enabled: policy.enabled,
    provider: policy.provider,
    root,
    include: policy.include,
    exclude: policy.exclude,
    allowExternal: policy.allowExternal,
    artifactRoot,
    policy,
  };
}

module.exports = {
  coveragePlanFromConfig,
  coveragePolicyFromConfig,
  stripCoverageCliArgs,
};
