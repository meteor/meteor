const {
  assertCoverageMap,
  deterministicStringify,
  serializeCoverageFrames,
} = require('../runtime/coverage-protocol.js');

function cloneCoverageMap(value) {
  const clone = value === undefined
    ? {}
    : JSON.parse(deterministicStringify(value));
  return assertCoverageMap(clone);
}

function coverageError(message) {
  const error = new Error(`[Meteor Rstest] ${message}`);
  error.code = 'METEOR_RSTEST_COVERAGE_UPLOAD';
  return error;
}

function validateEndpoint(endpoint, globalObject) {
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw coverageError('Coverage upload endpoint is invalid.');
  }
  const origin = globalObject.location && globalObject.location.origin;
  if (origin) {
    let resolved;
    try {
      resolved = new URL(endpoint, origin);
    } catch {
      throw coverageError('Coverage upload endpoint is invalid.');
    }
    if (resolved.origin !== origin) {
      throw coverageError('Coverage upload endpoint must be same-origin.');
    }
  }
  return endpoint;
}

async function responseError(response) {
  try {
    const payload = await response.json();
    if (payload && typeof payload.error === 'string') return payload.error;
  } catch {}
  return `HTTP ${response && response.status}`;
}

async function submitClientCoverage({
  coverage,
  token = coverage && coverage.token,
  globalObject = globalThis,
  fetchImpl = globalThis.fetch && globalThis.fetch.bind(globalThis),
}) {
  if (!coverage || coverage.enabled !== true) return { submitted: false };
  if (typeof fetchImpl !== 'function') {
    throw coverageError('Coverage upload requires fetch.');
  }
  const endpoint = validateEndpoint(coverage.endpoint, globalObject);
  const coverageMap = cloneCoverageMap(globalObject.__coverage__);
  const frames = serializeCoverageFrames({
    generation: coverage.generation,
    token,
    producer: 'client',
    coverage: coverageMap,
  });

  for (const frame of frames) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/json',
        'x-meteor-rstest-token': token,
      },
      body: JSON.stringify(frame),
    });
    if (!response || !response.ok) {
      throw coverageError(
        `Coverage upload was rejected: ${await responseError(response)}.`,
      );
    }
  }
  return { submitted: true };
}

async function completeClientRun({
  coverage,
  token,
  result,
  submitResult,
  globalObject = globalThis,
  fetchImpl,
}) {
  await submitClientCoverage({
    coverage,
    token,
    globalObject,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  await submitResult(result);
  return result;
}

module.exports = {
  cloneCoverageMap,
  completeClientRun,
  submitClientCoverage,
};
