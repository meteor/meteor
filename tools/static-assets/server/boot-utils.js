// Separated from boot.js for testing.

// Check that we have a pid that looks like an integer (non-decimal
// integer is okay).
exports.validPid = function (pid) {
  return ! isNaN(+pid);
};
