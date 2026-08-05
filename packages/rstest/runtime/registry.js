function isObject(value) {
  return value !== null && typeof value === 'object';
}

function deepEqual(left, right, seen = new Map()) {
  if (Object.is(left, right)) return true;
  if (!isObject(left) || !isObject(right)) return false;
  if (left.constructor !== right.constructor) return false;
  if (seen.get(left) === right) return true;
  seen.set(left, right);

  if (left instanceof Date) return left.getTime() === right.getTime();
  if (left instanceof RegExp) return String(left) === String(right);
  if (left instanceof Error) {
    return left.name === right.name && left.message === right.message &&
      deepEqual(left.cause, right.cause, seen);
  }
  if (left instanceof Set) {
    return left.size === right.size && [...left].every(leftValue =>
      [...right].some(rightValue => deepEqual(leftValue, rightValue, new Map(seen)))
    );
  }
  if (left instanceof Map) {
    return left.size === right.size && [...left].every(([leftKey, leftValue]) =>
      [...right].some(([rightKey, rightValue]) =>
        deepEqual(leftKey, rightKey, new Map(seen)) &&
        deepEqual(leftValue, rightValue, new Map(seen))
      )
    );
  }
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index], seen));
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(
    key => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key], right[key], seen)
  );
}

function printable(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertion(pass, message, negate) {
  const finalPass = negate ? !pass : pass;
  if (!finalPass) {
    const error = new Error(negate ? `Negated assertion failed: ${message}` : message);
    error.name = 'AssertionError';
    throw error;
  }
}

function createMatchers(received, negate = false) {
  const matchers = {
    toBe(expected) {
      assertion(Object.is(received, expected), `Expected ${printable(received)} to be ${printable(expected)}`, negate);
    },
    toEqual(expected) {
      assertion(deepEqual(received, expected), `Expected ${printable(received)} to equal ${printable(expected)}`, negate);
    },
    toStrictEqual(expected) {
      return this.toEqual(expected);
    },
    toBeTruthy() {
      assertion(Boolean(received), `Expected ${printable(received)} to be truthy`, negate);
    },
    toBeFalsy() {
      assertion(!received, `Expected ${printable(received)} to be falsy`, negate);
    },
    toBeDefined() {
      assertion(received !== undefined, 'Expected value to be defined', negate);
    },
    toBeUndefined() {
      assertion(received === undefined, `Expected ${printable(received)} to be undefined`, negate);
    },
    toBeNull() {
      assertion(received === null, `Expected ${printable(received)} to be null`, negate);
    },
    toContain(expected) {
      const pass = typeof received === 'string'
        ? received.includes(expected)
        : Array.isArray(received) && received.some(value => deepEqual(value, expected));
      assertion(pass, `Expected ${printable(received)} to contain ${printable(expected)}`, negate);
    },
    toMatch(expected) {
      const matcher = expected instanceof RegExp ? expected : new RegExp(String(expected));
      assertion(matcher.test(String(received)), `Expected ${printable(received)} to match ${matcher}`, negate);
    },
    toThrow(expected) {
      let thrown;
      if (received instanceof Error) {
        thrown = received;
      } else {
        try {
          received();
        } catch (error) {
          thrown = error;
        }
      }
      let pass = Boolean(thrown);
      if (pass && expected instanceof RegExp) pass = expected.test(thrown.message);
      if (pass && typeof expected === 'string') pass = thrown.message.includes(expected);
      if (pass && typeof expected === 'function') pass = thrown instanceof expected;
      assertion(pass, `Expected function to throw${expected ? ` ${printable(expected)}` : ''}`, negate);
    },
  };

  Object.defineProperties(matchers, {
    not: { get: () => createMatchers(received, !negate) },
    resolves: {
      get: () => createAsyncMatchers(Promise.resolve(received), false, negate),
    },
    rejects: {
      get: () => createAsyncMatchers(Promise.resolve(received), true, negate),
    },
  });
  return matchers;
}

function createAsyncMatchers(promise, expectsRejection, negate) {
  const invoke = async (matcher, args) => {
    let value;
    let rejected = false;
    try {
      value = await promise;
    } catch (error) {
      rejected = true;
      value = error;
    }
    assertion(
      expectsRejection ? rejected : !rejected,
      expectsRejection ? 'Expected promise to reject' : 'Expected promise to resolve',
      false
    );
    return createMatchers(value, negate)[matcher](...args);
  };
  return new Proxy({}, {
    get(_target, matcher) {
      if (matcher === 'not') {
        return createAsyncMatchers(promise, expectsRejection, !negate);
      }
      return (...args) => invoke(matcher, args);
    },
  });
}

function withTimeout(callback, timeoutMs, label) {
  let timer;
  return Promise.race([
    Promise.resolve().then(callback),
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(
        `[Meteor Rstest] ${label} timed out after ${timeoutMs}ms.`,
      )), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function serializeError(error) {
  return {
    name: error && error.name || 'Error',
    message: error && error.message || String(error),
    stack: error && error.stack || String(error),
  };
}

function createSuite(name, parent = null, mode = 'run') {
  return {
    name,
    parent,
    mode,
    suites: [],
    cases: [],
    hooks: { beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] },
  };
}

function createRegistry() {
  const root = createSuite('');
  let currentSuite = root;

  function describe(name, define, mode = 'run') {
    const suite = createSuite(name, currentSuite, mode);
    currentSuite.suites.push(suite);
    const previous = currentSuite;
    currentSuite = suite;
    try {
      define();
    } finally {
      currentSuite = previous;
    }
  }

  function registerCase(name, fn, mode = 'run') {
    currentSuite.cases.push({ name, fn, mode });
  }

  function test(name, fn) {
    registerCase(name, fn, 'run');
  }
  test.skip = (name, fn) => registerCase(name, fn, 'skip');
  test.todo = name => registerCase(name, null, 'todo');
  test.only = (name, fn) => registerCase(name, fn, 'only');

  describe.skip = (name, define) => describe(name, define, 'skip');

  function hook(name, callback) {
    currentSuite.hooks[name].push(callback);
  }

  function suitePath(suite) {
    const names = [];
    for (let cursor = suite; cursor && cursor.parent; cursor = cursor.parent) {
      names.unshift(cursor.name);
    }
    return names;
  }

  function ancestors(suite) {
    const items = [];
    for (let cursor = suite; cursor; cursor = cursor.parent) items.unshift(cursor);
    return items;
  }

  function hasOnly(suite, parentSkipped = false) {
    const skipped = parentSkipped || suite.mode === 'skip';
    if (skipped) return false;
    return suite.cases.some(item => item.mode === 'only') ||
      suite.suites.some(child => hasOnly(child, false));
  }

  function caseWillRun(suite, item, onlyMode, testNamePattern, suiteSkipped) {
    if (suiteSkipped || item.mode === 'skip' || item.mode === 'todo' ||
        onlyMode && item.mode !== 'only') {
      return false;
    }
    if (!testNamePattern) return true;
    const fullName = [...suitePath(suite), item.name].join(' > ');
    testNamePattern.lastIndex = 0;
    return testNamePattern.test(fullName);
  }

  function suiteWillRun(suite, onlyMode, testNamePattern, parentSkipped = false) {
    const suiteSkipped = parentSkipped || suite.mode === 'skip';
    if (suiteSkipped) return false;
    return suite.cases.some(item =>
      caseWillRun(suite, item, onlyMode, testNamePattern, false)
    ) || suite.suites.some(child =>
      suiteWillRun(child, onlyMode, testNamePattern, false)
    );
  }

  async function runCase(
    suite,
    item,
    onlyMode,
    testNamePattern,
    suiteSkipped,
    testTimeout,
    hookTimeout,
  ) {
    const fullName = [...suitePath(suite), item.name].join(' > ');
    if (testNamePattern) {
      testNamePattern.lastIndex = 0;
      if (!testNamePattern.test(fullName)) {
        return { name: item.name, fullName, status: 'skip' };
      }
    }
    if (suiteSkipped || item.mode === 'skip' || onlyMode && item.mode !== 'only') {
      return { name: item.name, fullName, status: 'skip' };
    }
    if (item.mode === 'todo') return { name: item.name, fullName, status: 'todo' };

    const parents = ancestors(suite);
    const beforeEachHooks = parents.flatMap(parent => parent.hooks.beforeEach);
    const afterEachHooks = parents.slice().reverse().flatMap(parent => parent.hooks.afterEach);
    const startedAt = Date.now();
    const errors = [];
    try {
      for (const callback of beforeEachHooks) {
        await withTimeout(callback, hookTimeout, `beforeEach for ${fullName}`);
      }
      await withTimeout(item.fn, testTimeout, fullName);
    } catch (error) {
      errors.push(serializeError(error));
    } finally {
      for (const callback of afterEachHooks) {
        try {
          await withTimeout(callback, hookTimeout, `afterEach for ${fullName}`);
        } catch (error) {
          errors.push(serializeError(error));
        }
      }
    }
    return {
      name: item.name,
      fullName,
      status: errors.length ? 'fail' : 'pass',
      duration: Date.now() - startedAt,
      ...(errors.length ? { errors } : {}),
    };
  }

  async function runSuite(
    suite,
    cases,
    onlyMode,
    testNamePattern,
    testTimeout,
    hookTimeout,
    parentSkipped = false,
  ) {
    const suiteSkipped = parentSkipped || suite.mode === 'skip';
    const shouldRunHooks = suiteWillRun(
      suite,
      onlyMode,
      testNamePattern,
      parentSkipped,
    );
    let beforeAllFailed = false;
    if (shouldRunHooks) {
      for (const callback of suite.hooks.beforeAll) {
        try {
          await withTimeout(callback, hookTimeout, `beforeAll for ${suitePath(suite).join(' > ') || '<root>'}`);
        } catch (error) {
          beforeAllFailed = true;
          cases.push({
            name: '<beforeAll>',
            fullName: `${suitePath(suite).join(' > ') || '<root>'} > <beforeAll>`,
            status: 'fail',
            errors: [serializeError(error)],
          });
          break;
        }
      }
    }
    for (const item of suite.cases) {
      cases.push(await runCase(
        suite,
        item,
        onlyMode,
        testNamePattern,
        suiteSkipped || beforeAllFailed,
        testTimeout,
        hookTimeout,
      ));
    }
    for (const child of suite.suites) {
      await runSuite(
        child,
        cases,
        onlyMode,
        testNamePattern,
        testTimeout,
        hookTimeout,
        suiteSkipped || beforeAllFailed,
      );
    }
    if (shouldRunHooks) {
      for (const callback of suite.hooks.afterAll) {
        try {
          await withTimeout(callback, hookTimeout, `afterAll for ${suitePath(suite).join(' > ') || '<root>'}`);
        } catch (error) {
          cases.push({
            name: '<afterAll>',
            fullName: `${suitePath(suite).join(' > ') || '<root>'} > <afterAll>`,
            status: 'fail',
            errors: [serializeError(error)],
          });
        }
      }
    }
  }

  async function run({
    testNamePattern,
    testTimeout = 30000,
    hookTimeout = 10000,
  } = {}) {
    const cases = [];
    const onlyMode = hasOnly(root);
    const namePattern = testNamePattern instanceof RegExp
      ? testNamePattern
      : testNamePattern ? new RegExp(String(testNamePattern)) : null;
    try {
      await runSuite(root, cases, onlyMode, namePattern, testTimeout, hookTimeout);
    } catch (error) {
      cases.push({
        name: '<suite hook>',
        fullName: '<suite hook>',
        status: 'fail',
        errors: [serializeError(error)],
      });
    }
    const stats = {
      total: cases.length,
      passed: cases.filter(item => item.status === 'pass').length,
      failed: cases.filter(item => item.status === 'fail').length,
      skipped: cases.filter(item => item.status === 'skip').length,
      todo: cases.filter(item => item.status === 'todo').length,
    };
    return { ok: stats.failed === 0, stats, cases };
  }

  return {
    afterAll: callback => hook('afterAll', callback),
    afterEach: callback => hook('afterEach', callback),
    beforeAll: callback => hook('beforeAll', callback),
    beforeEach: callback => hook('beforeEach', callback),
    describe,
    expect: value => createMatchers(value),
    run,
    test,
  };
}

module.exports = { createRegistry, deepEqual, serializeError };
