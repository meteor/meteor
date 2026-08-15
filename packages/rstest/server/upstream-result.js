const STATUS_FIELDS = {
  pass: 'passed',
  fail: 'failed',
  skip: 'skipped',
  todo: 'todo',
};

function assertTestPath(testPath) {
  const segments = typeof testPath === 'string' ? testPath.split('/') : [];
  if (
    typeof testPath !== 'string' ||
    testPath.length === 0 ||
    testPath.startsWith('/') ||
    testPath.includes('\\') ||
    testPath.includes('\0') ||
    segments.some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new TypeError(
      '[Meteor Rstest] Upstream result testPath must be a safe app-relative POSIX path.',
    );
  }
}

function normalizeCase(upstreamCase, fileTestPath) {
  if (!upstreamCase || typeof upstreamCase !== 'object') {
    throw new TypeError('[Meteor Rstest] Upstream case must be an object.');
  }
  if (typeof upstreamCase.name !== 'string' || upstreamCase.name.length === 0) {
    throw new TypeError('[Meteor Rstest] Upstream case name must be a non-empty string.');
  }
  if (!STATUS_FIELDS[upstreamCase.status]) {
    throw new TypeError(
      `[Meteor Rstest] Upstream case has unsupported status: ${upstreamCase.status}`,
    );
  }
  const testPath = upstreamCase.testPath || fileTestPath;
  assertTestPath(testPath);
  const parentNames = upstreamCase.parentNames;
  if (parentNames !== undefined && (
    !Array.isArray(parentNames) ||
    parentNames.some(name => typeof name !== 'string')
  )) {
    throw new TypeError('[Meteor Rstest] Upstream parentNames must be strings.');
  }

  return {
    name: upstreamCase.name,
    fullName: [...(parentNames || []), upstreamCase.name].join(' > '),
    status: upstreamCase.status,
    testPath,
    ...(upstreamCase.duration === undefined
      ? {}
      : { duration: upstreamCase.duration }),
    ...(upstreamCase.retryCount === undefined
      ? {}
      : { retryCount: upstreamCase.retryCount }),
    ...(upstreamCase.retryErrors === undefined
      ? {}
      : { retryErrors: upstreamCase.retryErrors }),
    ...(upstreamCase.meta === undefined ? {} : { meta: upstreamCase.meta }),
    ...(upstreamCase.errors === undefined
      ? {}
      : { errors: upstreamCase.errors }),
  };
}

function normalizeUpstreamFileResults(files) {
  if (!Array.isArray(files)) {
    throw new TypeError('[Meteor Rstest] Upstream file results must be an array.');
  }
  const cases = [];

  for (const file of files) {
    if (!file || typeof file !== 'object') {
      throw new TypeError('[Meteor Rstest] Upstream file result must be an object.');
    }
    assertTestPath(file.testPath);
    if (!Array.isArray(file.results)) {
      throw new TypeError('[Meteor Rstest] Upstream file results must be an array.');
    }
    for (const upstreamCase of file.results) {
      cases.push(normalizeCase(upstreamCase, file.testPath));
    }
  }

  const stats = { total: cases.length, passed: 0, failed: 0, skipped: 0, todo: 0 };
  for (const testCase of cases) {
    stats[STATUS_FIELDS[testCase.status]] += 1;
  }
  return {
    ok: stats.failed === 0,
    stats,
    cases,
  };
}

module.exports = {
  normalizeUpstreamFileResults,
};
