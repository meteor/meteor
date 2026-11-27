const path = require('path');
const vm = require('vm');

const modulePath = path.resolve(__dirname, 'node-process-warnings.js');

describe('node-process-warnings', () => {
  let realEmitWarning;
  let spy;

  beforeAll(() => {
    // Capture the real function before the production wrapper is installed.
    realEmitWarning = process.emitWarning;

    // Install a forwarding spy so the module's wrapper captures it as its
    // original function at require time.
    spy = jest.fn();
    process.emitWarning = spy;

    // Load the production module exactly once for this suite. Jest maintains
    // its own module registry, so reloading per test would not reliably pick
    // up a newly installed spy.
    require(modulePath);
  });

  beforeEach(() => {
    // Clear the spy's call history between tests without reloading the module.
    spy.mockClear();
  });

  afterAll(() => {
    // Restore the real function so the monkey-patched wrapper cannot leak into
    // other test files (process is shared across Jest test files in a worker).
    process.emitWarning = realEmitWarning;

    expect(process.emitWarning).toBe(realEmitWarning);
  });

  it('suppresses a string warning containing punycode', () => {
    process.emitWarning('The `punycode` module is deprecated.');

    expect(spy).not.toHaveBeenCalled();
  });

  it('suppresses an Error warning containing punycode without throwing', () => {
    const warning = new Error('The `punycode` module is deprecated.');

    expect(() => {
      process.emitWarning(warning);
    }).not.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });

  it('suppresses a cross-realm Error warning containing punycode without throwing', () => {
    // Errors created in a different JS realm (e.g. a Jest sandbox or a
    // separate vm context) fail `instanceof Error` but are still native
    // Errors, which `util.types.isNativeError()` correctly identifies.
    const context = vm.createContext({});
    const crossRealmWarning = vm.runInContext(
      'new Error("The `punycode` module is deprecated.")',
      context
    );

    expect(() => {
      process.emitWarning(crossRealmWarning);
    }).not.toThrow();

    expect(spy).not.toHaveBeenCalled();
  });

  it('forwards a normal string warning', () => {
    const message = 'A normal warning message';

    process.emitWarning(message);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(message);
  });

  it('forwards an Error-valued warning by identity without throwing', () => {
    const warning = new Error('Something went wrong');

    expect(() => {
      process.emitWarning(warning);
    }).not.toThrow();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(warning);
    expect(spy.mock.calls[0][0]).toBe(warning);
  });

  it('forwards an Error with a throwing message getter by identity', () => {
    const warning = new Error('original message');

    Object.defineProperty(warning, 'message', {
      configurable: true,
      get() {
        throw new Error('Cannot read warning message');
      },
    });

    // Reading the message getter throws, so the wrapper must not crash.
    expect(() => {
      process.emitWarning(warning);
    }).not.toThrow();

    // The original warning is delegated to Node unchanged. Use identity checks
    // only: `toHaveBeenCalledWith` performs deep comparison which would itself
    // access the throwing `message` getter.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(warning);
  });

  it('preserves legacy warning arguments (type and code)', () => {
    process.emitWarning('old api', 'DeprecationWarning', 'DEP0999');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('old api', 'DeprecationWarning', 'DEP0999');
  });

  it('forwards an options object by identity unchanged', () => {
    const options = {
      type: 'DeprecationWarning',
      code: 'TEST_CODE',
      detail: 'additional detail',
    };

    process.emitWarning('message with options', options);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('message with options', options);
    expect(spy.mock.calls[0][1]).toBe(options);
  });
});
