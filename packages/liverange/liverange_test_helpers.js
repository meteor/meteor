// checks that ranges balance and that node and index pointers are
// correct. if both of these things are true, then everything
// contained by 'range' must be a valid subtree. (assuming that
// visit() is actually working.)
var check_liverange_integrity = function (range) {
  var stack = [];

  var check_node = function (node) {
    var data = node[range.tag] || [[], []];
    for (var i = 0; i < data[0].length; i++) {
      if (data[0][i]._start !== node)
        throw new Error("integrity check failed - incorrect _start");
      if (data[0][i]._start_idx !== i)
        throw new Error("integrity check failed - incorrect _start_idx");
    }
    for (var i = 0; i < data[1].length; i++) {
      if (data[1][i]._end !== node)
        throw new Error("integrity check failed - incorrect _end");
      if (data[1][i]._end_idx !== i)
        throw new Error("integrity check failed - incorrect _end_idx");
    }
  };

  range.visit(function (is_start, range) {
    if (is_start)
      stack.push(range);
    else
      if (range !== stack.pop())
        throw new Error("integrity check failed - unbalanced range");
  }, function (is_start, node) {
    if (is_start) {
      check_node(node);
      stack.push(node);
    }
    else
      if (node !== stack.pop())
        throw new Error("integrity check failed - unbalanced node");
  });

  if (stack.length)
    throw new Error("integrity check failed - missing close tags");
};
