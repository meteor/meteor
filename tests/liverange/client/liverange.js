Results = new Sky.Collection;

var next_result = 0;

_.each(["begin", "ok", "fail"], function (what) {
  this[what] = function (message) {
    Results.insert({n: next_result++, message: message, type: what});
  };
});

Sky.startup(function () {
/*
  _.each([test_single], function (f) {
    try {
      f();
    } catch (e) {
      Results.insert({n: next_result++, type: "exception",
                      message: "Exception: " + e.name + ": " + e.message});
      throw e;
    }
  });
*/
  test_single();
  begin("end");
});

Template.results.results = function () {
  return Results.find({}, {sort: {n: 1}});
};

Template.results.type_is = function (arg) {
  return this.type === arg;
};

assert = function (expected, actual, message) {
  expected = JSON.stringify(expected);
  actual = JSON.stringify(actual);

  if (expected !== actual) {
    debugger;
    Results.insert({n: next_result++, type: "assert",
                    message: message || "Assert fail",
                    expected: expected, actual: actual});
  }
};

var create = function (id, start, end, tag) {
  var ret = new Sky.ui._LiveRange(tag || 'a', start, end);
  ret.id = id;
  return ret;
};

var frag = function (html) {
  var ret = document.createDocumentFragment();
  var q = $(html);
  for (var i = 0; i < q.length; i++)
    ret.appendChild(q[i]);
  return ret;
};

// takes ranges or fragments. tag is used only for fragments.
var dump = function (what, tag) {
  var ret = "";

  var emit = function (is_start, obj) {
    ret += (is_start ? "<": "</") + obj.id + ">";
  };

  if (what instanceof DocumentFragment) {
    var range = new Sky.ui._LiveRange(tag || 'a', what);
    range.visit(emit, emit);
    range.destroy();
  } else {
    emit(true, what);
    what.visit(emit, emit);
    emit(false, what);
  }

  return ret;
};

// checks that ranges balance and that node and index pointers are
// correct. if both of these things are true, then everything
// contained by 'range' must be a vaild subtree. (assuming that
// visit() is actually working.)
var check_integrity = function (range) {
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
    else {
      if (!range === stack.pop())
        throw new Error("integrity check failed - unbalanced range");
    }
  }, function (is_start, node) {
    if (is_start) {
      check_node(node);
      stack.push(node);
    }
    else {
      if (!node === stack.pop())
        throw new Error("integrity check failed - unbalanced node");
    }
  });
};

// actual can be a range or a fragment
var assert_dump = function (expected, actual, tag) {
  assert(expected, dump(actual), "Tree doesn't match");
  if (actual instanceof Sky.ui._LiveRange)
    check_integrity(actual);
  else {
    var range = new Sky.ui._LiveRange(tag || 'a', actual);
    check_integrity(range);
    range.destroy();
  }
};

var test_single = function () {
  begin("single node");

  var f = frag("<div id=1></div>");
  var r_a = create("a", f);
  assert(true, r_a instanceof Sky.ui._LiveRange);
  assert_dump("<a><1></1></a>", r_a);

  var r_b = create("b", f);
  assert_dump("<a><1></1></a>", r_a);
  assert_dump("<b><a><1></1></a></b>", r_b);

  var ret1 = r_a.replace_contents(frag("<div id=2></div>"));
  assert(true, ret1 instanceof DocumentFragment);
  assert_dump("<1></1>", ret1);
  assert_dump("<1></1>", f);
  assert_dump("<a><2></2></a>", r_a);
  assert_dump("<b><a><2></2></a></b>", r_b);

  var ret2 = r_b.replace_contents(frag("<div id=3></div>"));
  assert_dump("<a><2></2></a>", ret2);
  assert_dump("<a><2></2></a>", r_a);
  assert_dump("<b><3></3></b>", r_b);

  r_a.destroy();
  assert_dump("<2></2>", ret2);

  var r_c = create("c", f);
  var r_d = create("d", f);
  var r_e = create("e", f);
  assert_dump("<c><1></1></c>", r_c);
  assert_dump("<d><c><1></1></c></d>", r_d);
  assert_dump("<e><d><c><1></1></c></d></e>", r_e);
  assert_dump("<e><d><c><1></1></c></d></e>", ret1);

  r_d.destroy();



  
};
