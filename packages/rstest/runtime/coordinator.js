function createResultGate({ timeoutMs = 30000 } = {}) {
  let delivered = false;
  let value;
  let resolvePending;
  let rejectPending;
  let timer;
  let pending;

  function wait() {
    if (delivered) return Promise.resolve(value);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      resolvePending = resolve;
      rejectPending = reject;
      timer = setTimeout(() => {
        rejectPending(new Error(
          `[Meteor Rstest] Did not receive Meteor client Rstest result after ${timeoutMs}ms.`,
        ));
      }, timeoutMs);
    });
    return pending;
  }

  function submit(result) {
    if (delivered) return false;
    delivered = true;
    value = result;
    if (timer) clearTimeout(timer);
    if (resolvePending) resolvePending(result);
    return true;
  }

  return { submit, wait };
}

function mergeArchitectureResults(entries) {
  if (!entries.length) {
    return {
      ok: false,
      stats: { total: 1, passed: 0, failed: 1, skipped: 0, todo: 0 },
      cases: [{
        name: 'Meteor Rstest architecture selection',
        fullName: 'Meteor Rstest architecture selection',
        status: 'fail',
        duration: 0,
        architecture: 'coordinator',
        error: {
          name: 'Error',
          message: '[Meteor Rstest] No supported test architecture was selected.',
        },
      }],
    };
  }
  const stats = { total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };
  const cases = [];
  let ok = true;

  for (const entry of entries) {
    ok = ok && entry.result.ok;
    for (const field of Object.keys(stats)) {
      stats[field] += Number(entry.result.stats[field] || 0);
    }
    for (const testCase of entry.result.cases || []) {
      cases.push({ ...testCase, architecture: entry.architecture });
    }
  }

  return { ok, stats, cases };
}

function validateResult(result) {
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean' ||
      !result.stats || typeof result.stats !== 'object' || !Array.isArray(result.cases)) {
    return false;
  }
  const fields = ['total', 'passed', 'failed', 'skipped', 'todo'];
  if (fields.some(field => !Number.isSafeInteger(result.stats[field]) || result.stats[field] < 0)) {
    return false;
  }
  const statuses = new Set(['pass', 'fail', 'skip', 'todo']);
  if (result.cases.some(item => !item || typeof item.name !== 'string' ||
      !statuses.has(item.status))) {
    return false;
  }
  const counted = result.stats.passed + result.stats.failed +
    result.stats.skipped + result.stats.todo;
  return result.stats.total === counted && result.cases.length === counted &&
    result.ok === (result.stats.failed === 0);
}

module.exports = { createResultGate, mergeArchitectureResults, validateResult };
