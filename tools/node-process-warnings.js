const originalEmitWarning = process.emitWarning;

process.emitWarning = function (message) {
  /*
   * A warning was introduced in Node 22:
   *
   * "The `punycode` module is deprecated. Please use a userland alternative instead."
   *
   * The problem is that punycode is deeply integrated in the Node system. It's not a
   * simple direct dependency.
   *
   * Check these issues for more details:
   * https://github.com/mathiasbynens/punycode.js/issues/137
   * https://stackoverflow.com/questions/68774489/punycode-is-deprecated-in-npm-what-should-i-replace-it-with/78946745
   *
   * This warning was, besides being annoying, breaking our tests.
   */
  if (message.includes("punycode")) {
    return;
  }
  return originalEmitWarning(message);
};
