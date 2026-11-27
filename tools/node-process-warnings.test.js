// Unit tests for tools/node-process-warnings.js. The module runs its side
// effects (the BROWSERSLIST env var and the process.emitWarning override) at
// require time, so each test controls process state and re-requires it fresh.

describe('node-process-warnings', () => {
  let savedEmit;
  let savedEnv;

  beforeEach(() => {
    savedEmit = process.emitWarning;
    savedEnv = process.env.BROWSERSLIST_IGNORE_OLD_DATA;
    jest.resetModules();
  });

  afterEach(() => {
    process.emitWarning = savedEmit;
    if (savedEnv === undefined) {
      delete process.env.BROWSERSLIST_IGNORE_OLD_DATA;
    } else {
      process.env.BROWSERSLIST_IGNORE_OLD_DATA = savedEnv;
    }
  });

  test('sets BROWSERSLIST_IGNORE_OLD_DATA when unset', () => {
    delete process.env.BROWSERSLIST_IGNORE_OLD_DATA;
    require('./node-process-warnings.js');
    expect(process.env.BROWSERSLIST_IGNORE_OLD_DATA).toBe('1');
  });

  test('preserves an explicit BROWSERSLIST_IGNORE_OLD_DATA value', () => {
    process.env.BROWSERSLIST_IGNORE_OLD_DATA = '0';
    require('./node-process-warnings.js');
    expect(process.env.BROWSERSLIST_IGNORE_OLD_DATA).toBe('0');
  });

  test('suppresses punycode warnings but passes others through', () => {
    const seen = [];
    // The module captures the current process.emitWarning as the delegate, so
    // install a spy before requiring it.
    process.emitWarning = (message) => { seen.push(message); };
    require('./node-process-warnings.js');

    process.emitWarning('The `punycode` module is deprecated.');
    process.emitWarning('some unrelated deprecation');

    expect(seen).toEqual(['some unrelated deprecation']);
  });
});
