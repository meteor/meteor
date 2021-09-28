// Exception representing a test failure
export default class TestFailure {
  constructor(reason, details) {
    this.reason = reason;
    this.details = details || {};
    this.stack = (new Error()).stack;
  }
}
