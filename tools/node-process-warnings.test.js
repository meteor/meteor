describe('node-process-warnings', () => {
  let realEmitWarning;
  let originalMock;

  beforeEach(() => {
    realEmitWarning = process.emitWarning;
    originalMock = jest.fn();
    process.emitWarning = originalMock;
    jest.isolateModules(() => {
      require('./node-process-warnings.js');
    });
  });

  afterEach(() => {
    process.emitWarning = realEmitWarning;
  });

  it('suppresses string punycode warnings', () => {
    process.emitWarning(
      'The `punycode` module is deprecated.',
      'DeprecationWarning',
      'DEP0040'
    );
    expect(originalMock).not.toHaveBeenCalled();
  });

  it('suppresses Error-valued punycode warnings', () => {
    process.emitWarning(new Error('The `punycode` module is deprecated.'));
    expect(originalMock).not.toHaveBeenCalled();
  });

  it('forwards Error-valued warnings without throwing', () => {
    const error = new Error('boom');
    expect(() => process.emitWarning(error)).not.toThrow();
    expect(originalMock).toHaveBeenCalledWith(error);
  });

  it('forwards type, code and ctor', () => {
    function ctor() {}
    process.emitWarning('something', 'CustomWarning', 'CODE1', ctor);
    expect(originalMock).toHaveBeenCalledWith(
      'something',
      'CustomWarning',
      'CODE1',
      ctor
    );
  });

  it('forwards the options object', () => {
    const options = { type: 'CustomWarning', code: 'CODE1', detail: 'more' };
    process.emitWarning('something', options);
    expect(originalMock).toHaveBeenCalledWith('something', options);
  });
});
