/**
 * A simple call-recording mock function.
 * @type {MockFunction}
 */
MockFunction = class MockFunction {
  calls = [];

  constructor(fn = () => {}) {
    const self = this;
    const mocked = function (...args) {
      self.calls.push(args);
      return fn.call(this, ...args);
    };

    mocked.mock = this;

    return mocked;
  }

  reset() {
    this.calls.length = 0;
  }
}
