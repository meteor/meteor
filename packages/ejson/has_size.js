// Like `_.size(obj) === n` but faster by looking at at most `n+1`
// items
hasSize = function _hasSize(obj, n) {
  var seen = 0;
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      seen++;
      if (seen > n) {
        return false;
      }
    }
  }
  return seen === n;
};

// Like `_.size(obj) <= n` but faster by looking at at most `n+1`
// items
hasSizeAtMost = function _hasSizeAtMost(obj, n) {
  var seen = 0;
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      seen++;
      if (seen > n) {
        return false;
      }
    }
  }
  return true;
};
