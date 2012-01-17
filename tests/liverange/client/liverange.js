Results = new Sky.Collection;

var next_result = 0;

_.each(["section", "begin", "ok", "fail"], function (what) {
  this[what] = function (message) {
    Results.insert({n: next_result++, message: message, type: what});
  };
});

Sky.startup(function () {
  section("Meta tests");
  test_try_all_permutations();

  section("LiveRange");
  test_single();
  test_multi();
  test_deep_visit();
  test_create_inner();

  /*
  try {
    run();
  } catch (e) {
    Results.insert({n: next_result++, type: "exception",
                    message: "Exception: " + e.name + ": " + e.message});
    throw e;
  }
  */

  section("LiveUI");
  test_render();
  test_renderList();

  section("end");
});

Template.results.results = function () {
  return Results.find({}, {sort: {n: 1}});
};

Template.results.type_is = function (arg) {
  return this.type === arg;
};

var assert = function (expected, actual, message, not) {
  /* If expected is a DOM node, do a literal '===' comparison with
   * actual. Otherwise compare the JSON stringifications of expected
   * and actual. (It's no good to stringify a DOM node. Circular
   * references, to start with..) */
  if (typeof expected === "object" && expected.nodeType) {
    var matched = expected === actual;
    expected = "[Node]";
    actual = "[Unknown]";
  } else {
    expected = JSON.stringify(expected);
    actual = JSON.stringify(actual);
    var matched = expected === actual;
  }

  if (matched === !!not) {
    // debugger;
    Results.insert({n: next_result++, type: "assert",
                    message: message || "Assert fail",
                    expected: expected, actual: actual, not: !!not});
  }
};

var assert_not = function (expected, actual, message) {
  assert(expected, actual, message, true);
};

var create = function (id, start, end, inner, tag) {
  var ret = new Sky.ui._LiveRange(tag || 'a', start, end, inner);
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

  if (typeof what === 'object' && what.nodeType === 11 /* DocumentFragment */) {
    if (what.firstChild) {
      var range = new Sky.ui._LiveRange(tag || 'a', what);
      range.visit(emit, emit);
      range.destroy();
    }
  } else {
    emit(true, what);
    what.visit(emit, emit);
    emit(false, what);
  }

  return ret;
};

// checks that ranges balance and that node and index pointers are
// correct. if both of these things are true, then everything
// contained by 'range' must be a valid subtree. (assuming that
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

// actual can be a range or a fragment
var assert_dump = function (expected, actual, tag) {
  assert(expected, dump(actual), "Tree doesn't match");
  if (actual instanceof Sky.ui._LiveRange)
    check_integrity(actual);
  else {
    if (actual.firstChild) {
      var range = new Sky.ui._LiveRange(tag || 'a', actual);
      check_integrity(range);
      range.destroy();
    }
  }
};

var assert_contained = function (r, expected) {
  var actual = r.contained();

  var traverse = function (exp, act) {
    if (exp.range !== act.range)
      throw new Error("contained(): range doesn't match");
    if (exp.children.length !== act.children.length)
      throw new Error("contained(): different tree shape");
    for (var i = 0; i < exp.children.length; i++)
      traverse(exp.children[i], act.children[i]);
  };

  traverse(expected, actual);
};

// Given some functions, run them in every possible order.
//
// In simplest usage, takes one argument, an array of functions. Run
// those functions in every possible order. Or, if the first element
// of the array is an integer N, with the remaining elements being
// functions (N >= the number of functions), run every permutation of
// N functions from the array.
//
// Eg:
// try_all_permutations([A, B, C])
// => runs A, B, C; A, C, B; B, A, C; B, C, A; C, A, B; C, B, A
// (semicolons for clarity only)
//
// try_all_permutations([2, A, B, C])
// => runs A, B; A, C; B, A; B, C; C, A; C, B
//
// If more than one argument A_1, A_2 ... A_n is passed, each should
// be an array as described above. Compute the possible orderings O_1,
// O_2 ... O_n per above, and run the Cartesian product of the
// sets. (Except that unlike a proper Cartesian product, a set with
// zero elements will simply be ignored.)
//
// Eg:
// try_all_permutations([X], [A, B], [Y])
// => runs X, A, B, Y; X, B, A, Y
// try_all_permutations([X], [A, B], [], [Y])
// => same
//
// If a function is passed instead of an array, it will be treated as
// an array with one argument. In other words, these are the same:
// try_all_permutations([X], [A, B], [Y])
// try_all_permutations(X, [A, B], Y)

var try_all_permutations = function () {
  var args = Array.prototype.slice.call(arguments);

  var current_set = 0;
  var chosen = [];

  var expand_next_set = function () {
    if (current_set === args.length) {
      _.each(chosen, function (f) { f(); });
    } else {
      var set = args[current_set];
      if (typeof set === "function")
        set = [set];

      current_set++;
      if (typeof set[0] === "number")
        pick(set[0], set.slice(1));
      else
        pick(set.length, set);
      current_set--;
    }
  };

  var pick = function (how_many, remaining) {
    if (how_many === 0)
      expand_next_set();
    else {
      for (var i = 0; i < remaining.length; i++) {
        chosen.push(remaining[i]);
        pick(how_many - 1,
             remaining.slice(0, i).concat(remaining.slice(i + 1)))
        chosen.pop();
      }
    }
  };

  expand_next_set();
};

/******************************************************************************/

var test_try_all_permutations = function () {
  begin("try_all_permutations");

  // Have a good test of try_all_permutations, because it would suck
  // if try_all_permutations didn't actually run anything and so none
  // of our other tests actually did any testing.

  var out = "";
  try_all_permutations(
    function () {out += ":";},
    [
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";}
    ],
    function () {out += ".";}
  );

  assert(":ABC.:ACB.:BAC.:BCA.:CAB.:CBA.", out);

  out = "";
  try_all_permutations(
    [function () {out += ":";}],
    [
      2,
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";}
    ],
    [],
    [
      0,
      function () {out += "X";},
      function () {out += "Y";}
    ],
    function () {out += ".";}
  );

  assert(":AB.:AC.:BA.:BC.:CA.:CB.", out);

  out = "";
  try_all_permutations(
    [
      2,
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";},
      function () {out += "D";}
    ],
    [
      function () {out += "X";},
      function () {out += "Y";}
    ],
    function () {out += ".";}
  );
  assert("ABXY.ABYX.ACXY.ACYX.ADXY.ADYX.BAXY.BAYX.BCXY.BCYX.BDXY.BDYX.CAXY.CAYX.CBXY.CBYX.CDXY.CDYX.DAXY.DAYX.DBXY.DBYX.DCXY.DCYX.", out);

  var test = function (n) {
    var fs = [];
    var seq = "";
    var seen = {};

    for (var i = 0; i < n; i++)
      fs.push(_.bind(function (x) { seq += x + "_"; }, null, i));
    try_all_permutations(
      function () {seq = "";},
      fs,
      function () {
        if (seq in seen)
          throw new Error("duplicate permutation");
        seen[seq] = true;
      }
    );

    var expected_count = 1;
    for (var i = n; i >= 1; i--)
      expected_count *= i;
    assert(expected_count, _.keys(seen).length);
  };

  for (var i = 1; i <= 5; i++)
    test(i);

  try_all_permutations();
};

/******************************************************************************/

var test_single = function () {
  begin("single node");

  var f = frag("<div id=1></div>");
  var r_a = create("a", f);
  assert(true, r_a instanceof Sky.ui._LiveRange);
  assert_dump("<a><1></1></a>", r_a);
  assert_dump("<a><1></1></a>", f);
  assert_contained(r_a, {range: r_a, children: []});

  var r_b = create("b", f);
  assert_dump("<a><1></1></a>", r_a);
  assert_dump("<b><a><1></1></a></b>", r_b);
  assert_dump("<b><a><1></1></a></b>", f);
  assert_contained(r_a, {range: r_a, children: []});
  assert_contained(r_b, {range: r_b, children: [{range: r_a, children: []}]});
  assert(f.firstChild, r_a.firstNode());
  assert(f.lastChild, r_a.lastNode());
  assert(f.firstChild, r_b.firstNode());
  assert(f.lastChild, r_b.lastNode());

  var ret1 = r_a.replace_contents(frag("<div id=2></div>"));
  assert(true, ret1.nodeType === 11 /* DocumentFragment */);
  assert_dump("<1></1>", ret1);
  assert_dump("<a><2></2></a>", r_a);
  assert_dump("<b><a><2></2></a></b>", r_b);
  assert_dump("<b><a><2></2></a></b>", f);

  var ret2 = r_b.replace_contents(frag("<div id=3></div>"));
  assert_dump("<a><2></2></a>", ret2);
  assert_dump("<a><2></2></a>", r_a);
  assert_dump("<b><3></3></b>", r_b);
  assert_dump("<b><3></3></b>", f);

  r_a.destroy();
  assert_dump("<2></2>", ret2);

  var r_c = create("c", f);
  var r_d = create("d", f);
  var r_e = create("e", f);
  assert_dump("<c><b><3></3></b></c>", r_c);
  assert_dump("<d><c><b><3></3></b></c></d>", r_d);
  assert_dump("<e><d><c><b><3></3></b></c></d></e>", r_e);
  assert_dump("<1></1>", ret1);
  assert_dump("<b><3></3></b>", r_b);

  r_d.destroy();
  assert_dump("<b><3></3></b>", r_b);
  assert_dump("<c><b><3></3></b></c>", r_c);
  assert_dump("<e><c><b><3></3></b></c></e>", r_e);
  assert_dump("<1></1>", ret1);

  assert_contained(r_e,
                   {range: r_e,
                    children: [{range: r_c,
                                children: [{range: r_b, children: []}]}]});

  assert(f.firstChild, r_b.firstNode());
  assert(f.lastChild, r_b.lastNode());
  assert(f.firstChild, r_c.firstNode());
  assert(f.lastChild, r_c.lastNode());
  assert(f.firstChild, r_e.firstNode());
  assert(f.lastChild, r_e.lastNode());

  r_b.destroy();
  assert_dump("<c><3></3></c>", r_c);
  assert_dump("<e><c><3></3></c></e>", r_e);

  r_e.destroy();
  assert_dump("<c><3></3></c>", r_c);
};

var test_multi = function () {
  begin("multiple nodes");

  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");
  assert_dump("<1></1><2></2><3></3><4></4><5></5>", f);

  var r_a = create("a", f.childNodes[2], f.childNodes[3]);
  assert_dump("<1></1><2></2><a><3></3><4></4></a><5></5>", f);
  assert_dump("<a><3></3><4></4></a>", r_a);

  var r_b = create("b", f.childNodes[3], f.childNodes[3]);
  assert_dump("<1></1><2></2><a><3></3><b><4></4></b></a><5></5>", f);
  assert_dump("<a><3></3><b><4></4></b></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);

  var r_c = create("c", f.childNodes[2], f.childNodes[3]);
  assert_dump("<1></1><2></2><c><a><3></3><b><4></4></b></a></c><5></5>", f);
  assert_dump("<a><3></3><b><4></4></b></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><3></3><b><4></4></b></a></c>", r_c);

  var r_d = create("d", f.childNodes[3], f.childNodes[3]);
  assert_dump("<1></1><2></2><c><a><3></3><d><b><4></4></b></d></a></c><5></5>", f);
  assert_dump("<a><3></3><d><b><4></4></b></d></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><3></3><d><b><4></4></b></d></a></c>", r_c);
  assert_dump("<d><b><4></4></b></d>", r_d);

  var r_e = create("e", f.childNodes[2], f.childNodes[2]);
  assert_dump("<1></1><2></2><c><a><e><3></3></e><d><b><4></4></b></d></a></c><5></5>", f);
  assert_dump("<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump("<d><b><4></4></b></d>", r_d);
  assert_dump("<e><3></3></e>", r_e);

  var r_f = create("f", f.childNodes[2], f.childNodes[3]);
  assert_dump("<1></1><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f><5></5>", f);
  assert_dump("<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump("<d><b><4></4></b></d>", r_d);
  assert_dump("<e><3></3></e>", r_e);
  assert_dump("<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);

  assert_contained(r_f, {range: r_f, children: [{range: r_c, children: [{range: r_a, children: [{range: r_e, children: []},{range: r_d, children: [{range: r_b, children: []}]}]}]}]});

  var r_g = create("g", f.childNodes[0], f.childNodes[3]);
  var r_h = create("h", f.childNodes[0], f.childNodes[3]);
  var r_i = create("i", f.childNodes[1], f.childNodes[3]);
  assert_dump("<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5>", f);
  assert_dump("<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump("<d><b><4></4></b></d>", r_d);
  assert_dump("<e><3></3></e>", r_e);
  assert_dump("<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);
  assert_dump("<g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g>", r_g);
  assert_dump("<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h>", r_h);
  assert_dump("<i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i>", r_i);

  var f2 = frag("<div id=6></div><div id=7></div><div id=8></div>");
  f2.childNodes[1].appendChild(f);
  assert_dump("", f);
  assert_dump("<6></6><7><h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5></7><8></8>", f2);
  assert_dump("<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump("<d><b><4></4></b></d>", r_d);
  assert_dump("<e><3></3></e>", r_e);
  assert_dump("<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);
  assert_dump("<g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g>", r_g);
  assert_dump("<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h>", r_h);
  assert_dump("<i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i>", r_i);

  var r_j = create("j", f2.childNodes[1], f2.childNodes[2]);
  var r_k = create("k", f2.childNodes[0], f2.childNodes[2]);
  var r_l = create("l", f2.childNodes[0], f2.childNodes[2]);
  assert_dump("<l><k><6></6><j><7><h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5></7><8></8></j></k></l>", f2);

  var f3 = frag("<div id=9></div><div id=10></div><div id=11></div>");
  var r_m = create("m", f3.childNodes[0], f3.childNodes[2]);
  var r_n = create("n", f3.childNodes[0], f3.childNodes[0]);
  var r_o = create("o", f3.childNodes[0], f3.childNodes[0]);
  assert_dump("<m><o><n><9></9></n></o><10></10><11></11></m>", f3);

  var ret1 = r_i.replace_contents(f3);
  assert_dump("", f3);
  assert_dump("<2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", ret1);
  assert_dump("<l><k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k></l>", f2);
  assert_dump("<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump("<b><4></4></b>", r_b);
  assert_dump("<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump("<d><b><4></4></b></d>", r_d);
  assert_dump("<e><3></3></e>", r_e);
  assert_dump("<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);
  assert_dump("<g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g>", r_g);
  assert_dump("<h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h>", r_h);
  assert_dump("<i><m><o><n><9></9></n></o><10></10><11></11></m></i>",r_i);
  assert_dump("<j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j>", r_j);
  assert_dump("<k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k>", r_k);
  assert_dump("<l><k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k></l>", r_l);

  r_h.destroy();
  assert_dump("<l><k><6></6><j><7><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g><5></5></7><8></8></j></k></l>", f2);
  r_m.destroy();
  assert_dump("<l><k><6></6><j><7><g><1></1><i><o><n><9></9></n></o><10></10><11></11></i></g><5></5></7><8></8></j></k></l>", f2);
  r_n.destroy();
  assert_dump("<l><k><6></6><j><7><g><1></1><i><o><9></9></o><10></10><11></11></i></g><5></5></7><8></8></j></k></l>", f2);
  r_j.destroy();
  assert_dump("<l><k><6></6><7><g><1></1><i><o><9></9></o><10></10><11></11></i></g><5></5></7><8></8></k></l>", f2);
  r_o.destroy();
  assert_dump("<l><k><6></6><7><g><1></1><i><9></9><10></10><11></11></i></g><5></5></7><8></8></k></l>", f2);
  r_g.destroy();
  assert_dump("<l><k><6></6><7><1></1><i><9></9><10></10><11></11></i><5></5></7><8></8></k></l>", f2);
  r_l.destroy();
  assert_dump("<k><6></6><7><1></1><i><9></9><10></10><11></11></i><5></5></7><8></8></k>", f2);
  r_i.destroy();
  assert_dump("<k><6></6><7><1></1><9></9><10></10><11></11><5></5></7><8></8></k>", f2);
  r_k.destroy();
  assert_dump("<6></6><7><1></1><9></9><10></10><11></11><5></5></7><8></8>", f2);
};

var test_deep_visit = function () {
  begin("deep visit");

  var f = frag("<div id=1><div id=2><div id=3><div id=4><div id=5></div></div></div></div></div>");

  var dive = function (f, count) {
    for (var i = 0; i < count; i ++)
      f = f.firstChild;
    return f;
  };

  var r_a = create("a", dive(f, 5), dive(f, 5));
  var r_b = create("b", dive(f, 3), dive(f, 3));
  var r_c = create("c", dive(f, 2), dive(f, 2));
  var r_d = create("d", f);

  assert_dump("<d><1><c><2><b><3><4><a><5></5></a></4></3></b></2></c></1></d>",
              f);

  assert_contained(r_d,
                   {range: r_d, children: [{range: r_c, children: [{range: r_b, children: [{range: r_a, children: []}]}]}]});
};

var test_create_inner = function () {
  begin("create inner");

  // Basics

  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");
  assert_dump("<1></1><2></2><3></3><4></4><5></5>", f);

  var r_a = create("a", f.childNodes[2], f.childNodes[4], true);
  assert_dump("<1></1><2></2><a><3></3><4></4><5></5></a>", f);

  var r_b = create("b", f.childNodes[2], f.childNodes[4], true);
  assert_dump("<1></1><2></2><a><b><3></3><4></4><5></5></b></a>", f);

  var r_c = create("c", f.childNodes[2], f.childNodes[4]);
  assert_dump("<1></1><2></2><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  // [{[a] [b]}]

  var r_d = create("d", f.childNodes[0], f.childNodes[0]);
  var r_e = create("e", f.childNodes[1], f.childNodes[1]);
  var r_f = create("f", f.childNodes[0], f.childNodes[1]);
  assert_dump("<f><d><1></1></d><e><2></2></e></f><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_g = create("g", f.childNodes[0], f.childNodes[1], true);
  assert_dump("<f><g><d><1></1></d><e><2></2></e></g></f><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_h = create("h", f.childNodes[0], f.childNodes[1]);
  assert_dump("<h><f><g><d><1></1></d><e><2></2></e></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_i = create("i", f.childNodes[0], f.childNodes[1], true);
  assert_dump("<h><f><g><i><d><1></1></d><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_j = create("j", f.childNodes[0], f.childNodes[0], true);
  assert_dump("<h><f><g><i><d><j><1></1></j></d><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_k = create("k", f.childNodes[0], f.childNodes[0]);
  assert_dump("<h><f><g><i><k><d><j><1></1></j></d></k><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_l = create("l", f.childNodes[0], f.childNodes[1], true);
  assert_dump("<h><f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);
  assert_dump("<c><a><b><3></3><4></4><5></5></b></a></c>", r_c);
  assert_dump("<b><3></3><4></4><5></5></b>", r_b);
  assert_dump("<a><b><3></3><4></4><5></5></b></a>", r_a);
  assert_dump("<d><j><1></1></j></d>", r_d);
  assert_dump("<e><2></2></e>", r_e);
  assert_dump("<f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f>", r_f);
  assert_dump("<g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g>", r_g);
  assert_dump("<h><f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f></h>", r_h);
  assert_dump("<i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i>", r_i);
  assert_dump("<j><1></1></j>", r_j);
  assert_dump("<k><d><j><1></1></j></d></k>", r_k);
  assert_dump("<l><k><d><j><1></1></j></d></k><e><2></2></e></l>", r_l);

  // [{a b [c]}]
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[2], f.childNodes[2]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);
  assert_dump("<b><c><1></1><2></2><a><3></3></a></c></b>", f);

  // [{[a] b c}]

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);
  assert_dump("<b><c><a><1></1></a><2></2><3></3></c></b>", f);

  // [{[a b] c}]

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[1]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);
  assert_dump("<b><c><a><1></1><2></2></a><3></3></c></b>", f);

  // Cases where start and end have no common ranges, and so the
  // balance counter will have to run

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  assert_dump("<b><a><1></1></a><2></2><3></3></b>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[2]);
  r_b = create("b", f.childNodes[0], f.childNodes[0]);
  assert_dump("<a><b><1></1></b><2></2><3></3></a>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[2], f.childNodes[2]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  assert_dump("<b><1></1><2></2><a><3></3></a></b>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[2]);
  r_b = create("b", f.childNodes[2], f.childNodes[2]);
  assert_dump("<a><1></1><2></2><b><3></3></b></a>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[0]);
  r_c = create("c", f.childNodes[2], f.childNodes[2]);
  r_d = create("d", f.childNodes[2], f.childNodes[2]);
  r_e = create("e", f.childNodes[0], f.childNodes[2]);
  assert_dump("<e><b><a><1></1></a></b><2></2><d><c><3></3></c></d></e>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[0]);
  r_c = create("c", f.childNodes[2], f.childNodes[2]);
  r_e = create("e", f.childNodes[0], f.childNodes[2]);
  assert_dump("<e><b><a><1></1></a></b><2></2><c><3></3></c></e>", f);

  try_all_permutations(
    function () {
      f = frag("<div id=1></div><div id=2></div><div id=3></div>");
    },
    [
      function () { create("a", f.childNodes[1], f.childNodes[2]); },
      function () { create("b", f.childNodes[2], f.childNodes[2]); },
      function () { create("c", f.childNodes[0], f.childNodes[2]); }
    ],
    function () {
      assert_dump("<c><1></1><a><2></2><b><3></3></b></a></c>", f);
    }
  );

  try_all_permutations(
    function () {
      f = frag("<div id=1></div><div id=2></div><div id=3></div>");
    },
    [
      function () { create("a", f.childNodes[0], f.childNodes[0]); },
      function () { create("b", f.childNodes[0], f.childNodes[1]); },
      function () { create("c", f.childNodes[0], f.childNodes[2]); }
    ],
    function () {
      assert_dump("<c><b><a><1></1></a><2></2></b><3></3></c>", f);
    }
  );
}


/******************************************************************************/

var dump_frag = function (frag) {
  var ret = '';

  var dump_children = function (node) {
    for (var child = node.firstChild; child; child = child.nextSibling)
      dump(child);
  };

  var dump = function (node) {
    if (node.nodeType === 8) /* comment */
      ret += "<!---->";
    else if (node.nodeType === 3) { /* text */
      // strip whitespace. note, no entity escaping
      ret += node.nodeValue.replace(/^\s+|\s+$/g, "");
    }
    else {
      ret += '<' + node.id + '>';
      dump_children(node);
      ret += '</' + node.id + '>';
    }
  };

  dump_children(frag);
  return ret;
}

// if passed a node instead of a fragment, dump its children. turns
// out to be handy.
//
// if expected includes '~', it will be interpreted to mean "either
// <!----> or nothing". this is useful because LiveRange is sometimes
// forced to insert placeholder comments on older versions of IE.
var assert_frag = function (expected, actual_frag) {
  var expected1 = expected.replace(/~/g, "");
  var expected2 = expected.replace(/~/g, "<!---->");
  var actual = dump_frag(actual_frag);

  if (actual !== expected1 && actual !== expected2)
    Results.insert({n: next_result++, type: "assert",
                    message: "Fragment doesn't match pattern",
                    expected: expected, actual: actual});

  if (actual.firstChild) {
    /* XXX get Sky.ui._tag in a cleaner way */
    var range = new Sky.ui._LiveRange(Sky.ui._tag, actual);
    check_integrity(range);
    range.destroy();
  }
};

var weather = {here: "cloudy", there: "cloudy"};
var weather_listeners = {here: {}, there: {}};
var get_weather = function (where) {
  var context = Sky.deps.Context.current;
  if (context && !(context.id in weather_listeners[where])) {
    weather_listeners[where][context.id] = context;
    context.on_invalidate(function (old_context) {
      delete weather_listeners[where][old_context.id];
    });
  }
  return weather[where];
};
var set_weather = function (where, what) {
  weather[where] = what;
  for (id in weather_listeners[where])
    weather_listeners[where][id].invalidate();
};

var test_render = function () {
  begin("render - coercion");

  assert_frag("<a></a>", Sky.ui.render(function () {
    return DIV({id: "a"});
  }));

  assert_frag("<b></b><c></c>", Sky.ui.render(function () {
    var f = document.createDocumentFragment();
    f.appendChild(DIV({id: "b"}));
    f.appendChild(DIV({id: "c"}));
    return f;
  }));

  assert_frag("<d></d><e></e>", Sky.ui.render(function () {
    return [
      DIV({id: "d"}),
      DIV({id: "e"})
    ];
  }));

  assert_frag("<f></f><g></g>", Sky.ui.render(function () {
    return $('<div id="f"></div><div id="g"></div>');
  }));

  assert_frag("~hi~", Sky.ui.render(function () {
    return document.createTextNode("hi");
  }));

  assert_frag("~igloo~", Sky.ui.render(function () {
    return "igloo";
  }));

  assert_frag("<!---->", Sky.ui.render(function () {
    return document.createComment('');
  }));

  begin("render - updating and GC");

  set_weather("here", "cloudy");
  assert(0, _.keys(weather_listeners.here).length);
  var r = Sky.ui.render(function () {
    return get_weather("here");
  });
  assert(1, _.keys(weather_listeners.here).length);
  assert_frag("~cloudy~", r);

  set_weather("here", "icy");
  assert(1, _.keys(weather_listeners.here).length);
  assert_frag("~cloudy~", r);
  Sky.flush(); // not onscreen -- gets GC'd
  assert(0, _.keys(weather_listeners.here).length);
  assert_frag("~cloudy~", r);

  r = Sky.ui.render(function () {
    return get_weather("here");
  });
  var onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(r);
  document.body.appendChild(onscreen);

  assert_frag("~icy~", onscreen);
  assert(1, _.keys(weather_listeners.here).length);

  set_weather("here", "vanilla");
  assert(1, _.keys(weather_listeners.here).length);
  assert_frag("~icy~", onscreen);
  Sky.flush();
  assert(1, _.keys(weather_listeners.here).length);
  assert_frag("~vanilla~", onscreen);

  document.body.removeChild(onscreen);
  Sky.flush();
  assert(1, _.keys(weather_listeners.here).length);

  set_weather("here", "curious"); // safe from GC until flush
  document.body.appendChild(onscreen);
  Sky.flush();
  assert(1, _.keys(weather_listeners.here).length);
  assert_frag("~curious~", onscreen);

  document.body.removeChild(onscreen);
  set_weather("here", "penguins");
  assert(1, _.keys(weather_listeners.here).length);
  assert_frag("~curious~", onscreen);
  Sky.flush();
  assert(0, _.keys(weather_listeners.here).length);
  assert_frag("~curious~", onscreen);

  begin("render - recursive");
  set_weather("there", "wet");

  var outer_count = 0;
  var inner_count = 0;
  var onscreen = DIV({style: "display: none;"}, [
    Sky.ui.render(function () {
      outer_count++;
      return DIV({id: "outer"}, [get_weather("here"),
                  Sky.ui.render(function () {
                    inner_count++;
                    return get_weather("there");
                  })
                 ]);
    })
  ]);
  document.body.appendChild(onscreen);
  assert_frag("<outer>penguins~wet~</outer>", onscreen);
  assert(1, outer_count);
  assert(1, inner_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);

  set_weather("there", "dry");
  Sky.flush();
  assert_frag("<outer>penguins~dry~</outer>", onscreen);
  assert(1, outer_count);
  assert(2, inner_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);

  set_weather("here", "chocolate");
  Sky.flush();
  assert_frag("<outer>chocolate~dry~</outer>", onscreen);
  assert(2, outer_count);
  assert(3, inner_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);

  document.body.removeChild(onscreen);
  set_weather("there", "melting"); // safe from GC until flush
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);
  document.body.appendChild(onscreen);
  Sky.flush();
  assert_frag("<outer>chocolate~melting~</outer>", onscreen);
  assert(2, outer_count);
  assert(4, inner_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);

  document.body.removeChild(onscreen);
  set_weather("here", "silent");
  Sky.flush();
  assert_frag("<outer>chocolate~melting~</outer>", onscreen);
  assert(2, outer_count);
  assert(4, inner_count);
  assert(0, _.keys(weather_listeners.here).length);
  assert(0, _.keys(weather_listeners.there).length);

  begin("render - events");

  var evts = '';
  onscreen = DIV({style: "display: none;"}, [
    Sky.ui.render(function () {
      return [
        Sky.ui.render(function () {
          get_weather("there");
          return DIV({id: "wrapper"}, [
            DIV({id: "outer"}, [
              DIV({id: "inner1"}),
              Sky.ui.render(function () {
                return DIV({id: "inner2"});
              })
            ])])
        }),
        Sky.ui.render(function () {
          if (get_weather("here") !== "expansive")
            return [];
          return DIV({id: "wrapper2"}, [
            DIV({id: "outer2"}, [
              DIV({id: "inner21"}),
              Sky.ui.render(function () {
                return DIV({id: "inner2"});
              })
            ])
          ]);
        })
      ];
    }, {
      "click": function (e) {
        assert(this.x, 12);
        evts += "a" + e.originalEvent.data;
      },
      "mousedown #outer": function (e) {
        assert(this.x, 12);
        evts += "b" + e.originalEvent.data;
      },
      "mouseup #inner1": function (e) {
        assert(this.x, 12);
        evts += "c1" + e.originalEvent.data;
      },
      "mouseup #inner2": function (e) {
        assert(this.x, 12);
        evts += "c2" + e.originalEvent.data;
      },
      "keypress, keydown #inner2": function (e) {
        assert(this.x, 12);
        evts += "de" + e.originalEvent.data;
      },
      "keyup #wrapper": function (e) {
        assert(this.x, 12);
        evts += "f" + e.originalEvent.data;
      }
    }, {x : 12})
  ]);
  document.body.appendChild(onscreen);

  var simulate = function (node, event, args) {
    node = (node instanceof $ ? node[0] : node);

    if (document.createEvent) {
      var e = document.createEvent("Event");
      e.initEvent(event, true, true);
      _.extend(e, args);
      node.dispatchEvent(e);
    } else {
      var e = document.createEventObject();
      _.extend(e, args);
      node.fireEvent("on" + event, e);
    }
  };

  var test  = function (expected, id, event, args) {
    evts = "";
    simulate($('#' + id), event, args);
    assert(expected, evts);
  }

  var main_event_tests = function () {
    test('a0', 'inner1', 'click', {data: 0});
    test('a1', 'inner2', 'click', {data: 1});
    test('a2', 'outer', 'click', {data: 2});
    test('a3', 'wrapper', 'click', {data: 3});
    test('b4', 'inner1', 'mousedown', {data: 4});
    test('b5', 'inner2', 'mousedown', {data: 5});
    test('b6', 'outer', 'mousedown', {data: 6});
    test('', 'wrapper', 'mousedown', {data: 7});
    test('c18', 'inner1', 'mouseup', {data: 8});
    test('c29', 'inner2', 'mouseup', {data: 9});
    test('', 'outer', 'mouseup', {data: 10});
    test('', 'wrapper', 'mouseup', {data: 11});
    test('de12', 'inner1', 'keypress', {data: 12});
    test('de13', 'inner2', 'keypress', {data: 13});
    test('de14', 'outer', 'keypress', {data: 14});
    test('de15', 'wrapper', 'keypress', {data: 15});
    test('', 'inner1', 'keydown', {data: 16});
    test('de17', 'inner2', 'keydown', {data: 17});
    test('', 'outer', 'keydown', {data: 18});
    test('', 'wrapper', 'keydown', {data: 19});
    test('', 'inner1', 'keyup', {data: 20});
    test('', 'inner2', 'keyup', {data: 21});
    test('', 'outer', 'keyup', {data: 22});
    // XXX expected failure -- selectors will never match top-level nodes
    // test('f23', 'wrapper', 'keyup', {data: 23});
  };
  main_event_tests();

  set_weather("here", "expansive");
  Sky.flush();
  main_event_tests();

  // XXX expected failure -- top-level nodes that appear later will
  // not get events delivered to them or their children, because event
  // handlers will not get installed on them..
  // test("a23", 'inner21', 'click', {data: 23});

  set_weather("there", "peachy");
  Sky.flush();
  // XXX expected failure -- if a LiveRange at toplevel gets
  // repopulated, then it won't get event handlers installed on
  // it. really the same case as the previous.
  // main_event_tests();

  document.body.removeChild(onscreen);
};

var test_renderList = function () {
  var c = Sky.Collection();

  var r = Sky.ui.renderList(c, {
    sort: ["id"],
    render: function (doc) {
      return DIV({id: doc.id});
    },
    render_empty: function () {
      return DIV({id: "empty"});
    }
  });

  assert_frag("<empty></empty>", r);

  begin("renderList - insertion");

  c.insert({id: "D"});
  assert_frag("<D></D>", r);
  c.insert({id: "E"});
  assert_frag("<D></D><E></E>", r);
  c.insert({id: "F"});
  assert_frag("<D></D><E></E><F></F>", r);
  c.insert({id: "C"});
  assert_frag("<C></C><D></D><E></E><F></F>", r);
  c.insert({id: "D2"});
  assert_frag("<C></C><D></D><D2></D2><E></E><F></F>", r);

  // this should hit all of the edge cases in insert_before
  var parts;
  var do_insert = function (id) {
    c.insert({id: id});
    parts.push("<" + id + "></" + id + ">");
    parts.sort();
    assert_frag(parts.join(''), r);
  };
  try_all_permutations(
    function () {
      c.remove();
      parts = [];
      assert_frag("<empty></empty>", r);
    },
    [
      _.bind(do_insert, null, "D"),
      _.bind(do_insert, null, "E"),
      _.bind(do_insert, null, "F"),
      _.bind(do_insert, null, "G")
    ],
    function () {
      assert_frag("<D></D><E></E><F></F><G></G>", r);
    }
  );

  c.insert({id: "C"});
  c.insert({id: "D2"});
  c.remove({id: "G"});

  begin("renderList - change without move");

  c.update({id: "E"}, {$set: {id: "E2"}});
  assert_frag("<C></C><D></D><D2></D2><E2></E2><F></F>", r);
  c.update({id: "F"}, {$set: {id: "F2"}});
  assert_frag("<C></C><D></D><D2></D2><E2></E2><F2></F2>", r);
  c.update({id: "C"}, {$set: {id: "C2"}});
  assert_frag("<C2></C2><D></D><D2></D2><E2></E2><F2></F2>", r);

  begin("renderList - removal");
  c.remove({id: "D2"});
  assert_frag("<C2></C2><D></D><E2></E2><F2></F2>", r);
  c.remove({id: "F2"});
  assert_frag("<C2></C2><D></D><E2></E2>", r);
  c.remove({id: "C2"});
  assert_frag("<D></D><E2></E2>", r);
  c.remove({id: "E2"});
  assert_frag("<D></D>", r);
  c.remove({id: "D"});
  assert_frag("<empty></empty>", r);

  // this should hit all of the edge cases in extract
  var do_remove = function (id) {
    c.remove({id: id});
    delete parts["<" + id + "></" + id + ">"];
    assert_frag(_.keys(parts).sort().join('') || '<empty></empty>', r);
  };
  try_all_permutations(
    function () {
      parts = {};
      _.each(["D", "E", "F", "G"], function (id) {
        c.insert({id: id});
        parts["<" + id + "></" + id + ">"] = true;
      });
      assert_frag("<D></D><E></E><F></F><G></G>", r);
    },
    [
      _.bind(do_remove, null, "D"),
      _.bind(do_remove, null, "E"),
      _.bind(do_remove, null, "F"),
      _.bind(do_remove, null, "G")
    ],
    function () {
      assert_frag("<empty></empty>", r);
    }
  );

  begin("renderList - default render empty");

  r = Sky.ui.renderList(c, {
    sort: ["id"],
    render: function (doc) {
      return DIV({id: doc.id});
    }
  });
  assert_frag("<!---->", r);

  c.insert({id: "D"});
  assert_frag("<D></D>", r);
  c.remove({id: "D"});
  assert_frag("<!---->", r);

  begin("renderList - change and move");

  c.insert({id: "D"});
  c.insert({id: "E"});
  assert_frag("<D></D><E></E>", r);
  c.update({id: "D"}, {id: "F"});
  assert_frag("<E></E><F></F>", r);
  c.update({id: "E"}, {id: "G"});
  assert_frag("<F></F><G></G>", r);
  c.update({id: "G"}, {id: "C"});
  assert_frag("<C></C><F></F>", r);
  c.insert({id: "E"});
  assert_frag("<C></C><E></E><F></F>", r);
  c.insert({id: "D"});
  assert_frag("<C></C><D></D><E></E><F></F>", r);
  c.update({id: "C"}, {id: "D2"});
  assert_frag("<D></D><D2></D2><E></E><F></F>", r);
  c.update({id: "F"}, {id: "D3"});
  assert_frag("<D></D><D2></D2><D3></D3><E></E>", r);
  c.update({id: "D3"}, {id: "C"});
  assert_frag("<C></C><D></D><D2></D2><E></E>", r);
  c.update({id: "D2"}, {id: "F"});
  assert_frag("<C></C><D></D><E></E><F></F>", r);

  begin("renderList - termination");

  c.remove();
  c.insert({id: "A"});
  assert_frag("<A></A>", r);
  Sky.flush(); // not onscreen, so terminates
  c.insert({id: "B"});
  assert_frag("<A></A>", r);
  c.remove({id: "A"});
  assert_frag("<A></A>", r);
  Sky.flush();
  assert_frag("<A></A>", r);

  var before_flush;
  var should_gc;
  var onscreen;
  var second_is_noop;
  try_all_permutations(
    // Set up
    function () {
      c.remove();
      c.insert({id: "A"});
      c.insert({id: "B"});
      r = Sky.ui.renderList(c, {
        sort: ["id"],
        render: function (doc) {
          return DIV({id: doc.id});
        }
      });
      assert_frag("<A></A><B></B>", r);
      should_gc = false;
      onscreen = null;
      second_is_noop = false;
    },
    // Modify. Should not trigger GC, even though the element isn't
    // onscreen, since a flush hasn't happened yet.
    [1,
     function () {c.insert({id: "C"});},
     function () {c.update({id: "A"}, {id: "A2"});},
     function () {c.update({id: "A"}, {id: "X"});},
     function () {c.remove({id: "A"});}
    ],
    function () {
      before_flush = dump_frag(r);
      assert_not("<A></A><B></B>", before_flush);
    },
    // Possibly put onscreen.
    [1,
     function () {
       onscreen = DIV({style: "display: none;"});
       onscreen.appendChild(r);
       document.body.appendChild(onscreen);
     },
     function () { }
    ],
    // Possibly flush.
    [1,
     function () {
       Sky.flush();
       should_gc = !onscreen;
     },
     function () { }
    ],
    // Take a second action.
    [1,
     function () {c.insert({id: "D"});},
     function () {c.update({id: "B"}, {id: "B2"});},
     function () {c.update({id: "B"}, {id: "Y"});},
     function () {c.remove({id: "B"});},
     function () {second_is_noop = true;}
    ],
    // If GC was supposed to be triggered, make sure it actually was
    // triggered.
    function () {
      if (should_gc || second_is_noop)
        assert_frag(before_flush, onscreen || r);
      else
        assert_not(before_flush, dump_frag(onscreen || r));

      if (onscreen)
        document.body.removeChild(onscreen);
    }
  );

  begin("renderList - list items are reactive");

  set_weather("here", "cloudy");
  set_weather("there", "cloudy");
  Sky.flush();
  var render_count = 0;
  c.remove();
  r = Sky.ui.renderList(c, {
    sort: ["id"],
    render: function (doc) {
      render_count++;
      if (doc.want_weather)
        return DIV({id: doc.id + "_" + get_weather(doc.want_weather)});
      else
        return DIV({id: doc.id});
    }
  });
  onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(r);
  document.body.appendChild(onscreen);

  assert(0, render_count);
  c.insert({id: "A", want_weather: "here"});
  assert(1, render_count);
  assert_frag("<A_cloudy></A_cloudy>", onscreen);

  c.insert({id: "B", want_weather: "here"});
  assert(2, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><B_cloudy></B_cloudy>", onscreen);

  c.insert({id: "C"});
  assert(3, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><B_cloudy></B_cloudy><C></C>", onscreen);

  c.update({id: "B"}, {$set: {id: "B2"}});
  assert(4, render_count);
  assert(3, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><B2_cloudy></B2_cloudy><C></C>", onscreen);

  Sky.flush();
  assert(4, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><B2_cloudy></B2_cloudy><C></C>", onscreen);

  c.update({id: "B2"}, {$set: {id: "D"}});
  assert(5, render_count); // move doesn't rerender
  assert(3, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><C></C><D_cloudy></D_cloudy>", onscreen);

  Sky.flush();
  assert(5, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><C></C><D_cloudy></D_cloudy>", onscreen);

  set_weather("here", "sunny");
  assert(5, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<A_cloudy></A_cloudy><C></C><D_cloudy></D_cloudy>", onscreen);

  Sky.flush();
  assert(7, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<A_sunny></A_sunny><C></C><D_sunny></D_sunny>", onscreen);

  c.remove({id: "A"});
  assert(7, render_count);
  assert(2, _.keys(weather_listeners.here).length);
  assert_frag("<C></C><D_sunny></D_sunny>", onscreen);

  Sky.flush();
  assert(7, render_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(0, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny>", onscreen);

  c.insert({id: "F", want_weather: "there"});
  assert(8, render_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny><F_cloudy></F_cloudy>", onscreen);

  r.appendChild(onscreen); // take offscreen
  Sky.flush();
  assert(8, render_count);
  assert(1, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny><F_cloudy></F_cloudy>", onscreen);

  // it's offscreen, but it wasn't taken off through a mechanism that
  // calls Sky.ui._cleanup, so we take the slow GC path. the entries
  // will notice as they get invalidated, but the list won't notice
  // until it has a structure change (at which point any remaining
  // entries will get torn down too.)
  set_weather("here", "ducky");
  Sky.flush();
  assert(8, render_count);
  assert(0, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny><F_cloudy></F_cloudy>", onscreen);

  c.insert({id: "E"});
  // insert renders the doc -- it has to, since renderList GC happens
  // only on flush
  assert(9, render_count);
  assert(0, _.keys(weather_listeners.here).length);
  assert(1, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny><E></E><F_cloudy></F_cloudy>", onscreen);

  Sky.flush();
  assert(9, render_count);
  assert(0, _.keys(weather_listeners.here).length);
  assert(0, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny><E></E><F_cloudy></F_cloudy>", onscreen);

  c.insert({id: "G"});
  Sky.flush();
  assert(9, render_count);
  assert(0, _.keys(weather_listeners.here).length);
  assert(0, _.keys(weather_listeners.there).length);
  assert_frag("<C></C><D_sunny></D_sunny><E></E><F_cloudy></F_cloudy>", onscreen);

  begin("renderList - multiple elements in an item");

  var lengths = [];
  var present, changed, moved;
  var mode;
  var update = function (index) {
    if (mode === "add") {
      c.insert({index: index, moved: 0});
      present[index] = true;
    }
    else if (mode === "remove") {
      c.remove({index: index});
      present[index] = false;
    }
    else if (mode === "change") {
      c.update({index: index}, {$set: {changed: true}});
      changed[index] = true;
    }
    else if (mode === "move") {
      c.update({index: index}, {$set: {moved: 1}});
      moved[index] = true;
    }

    var parts = {}
    for (var i = 0; i < 3; i++) {
      if (present[i])
        parts[(moved[i] ? "1_" : "0_") + i] = i;
    }
    var expected = "";
    _.each(_.keys(parts).sort(), function (key) {
      var index = parts[key];
      for (var i = 0; i < lengths[index]; i++) {
        var id = index + "_" + i + (changed[index] ? "B" : "");
        expected += "<" + id + "></" + id + ">";
      }
      if (lengths[index] === 0)
        expected += "<!---->";
    });
    assert_frag(expected || "<!---->", r);
  };
  /* Consider uncommenting the 6 lines below in a "slow tests" mode */
  try_all_permutations(
    [1,
//     function () {lengths[0] = 0;},
     function () {lengths[0] = 1;},
//     function () {lengths[0] = 2;},
     function () {lengths[0] = 3;}
    ],
    [1,
//     function () {lengths[1] = 0;},
//     function () {lengths[1] = 1;},
     function () {lengths[1] = 2;},
     function () {lengths[1] = 3;}
    ],
    [1,
//     function () {lengths[2] = 0;},
     function () {lengths[2] = 1;},
     function () {lengths[2] = 2;}
//     ,function () {lengths[2] = 3;}
    ],
    [1,
     function () {mode = "add";},
     function () {mode = "remove";},
     function () {mode = "change";},
     function () {mode = "move";}
    ],
    function () {
      c.remove();
      Sky.flush();
      r = Sky.ui.renderList(c, {
        sort: ["moved", "index"],
        render: function (doc) {
          var ret = [];
          for (var i = 0; i < lengths[doc.index]; i++)
            ret.push(DIV({id: doc.index + "_" + i + (doc.changed ? "B" : "")}));
          return ret;
        }
      });

      present = mode === "add" ? [false, false, false] : [true, true, true];
      changed = [false, false, false];
      moved = [false, false, false];
      if (mode !== "add") {
        for (var i = 0; i < 3; i++)
          c.insert({index: i, moved: 0});
      }
    },
    [
      _.bind(update, null, 0),
      _.bind(update, null, 1),
      _.bind(update, null, 2)
    ]
  );

  begin("renderList - #each");

  c.remove();
  var render_count = 0;

  _.extend(Template.test_renderList_each, {
    render_count: function () {
      return render_count++;
    },
    weather: function (where) {
      return get_weather(where);
    },
    data: function () {
      return c.findLive({x: {$lt: 5}}, {sort: ["x"]});
    },
    data2: function () {
      return c.findLive({x: {$gt: 5}}, {sort: ["x"]});
    }
  });

  onscreen = DIV({style: "display: none;"});
  onscreen.appendChild(Template.test_renderList_each());
  document.body.appendChild(onscreen);

  assert_frag("~Before0<!---->Middle~Else~After~", onscreen);
  assert(0, _.keys(weather_listeners.here).length);

  c.insert({x: 2, name: "A"});
  assert_frag("~Before0~Aducky~Middle~Else~After~", onscreen);
  assert(1, _.keys(weather_listeners.here).length);

  c.insert({x: 3, name: "B"});
  assert_frag("~Before0~Aducky~~Bducky~Middle~Else~After~", onscreen);
  assert(2, _.keys(weather_listeners.here).length);

  set_weather("here", "clear");
  assert_frag("~Before0~Aducky~~Bducky~Middle~Else~After~", onscreen);
  assert(2, _.keys(weather_listeners.here).length);
  Sky.flush();
  assert_frag("~Before0~Aclear~~Bclear~Middle~Else~After~", onscreen);
  assert(2, _.keys(weather_listeners.here).length);

  c.update({x: 3}, {$set: {x: 8}});
  assert_frag("~Before0~Aclear~Middle~B~After~", onscreen);
  assert(2, _.keys(weather_listeners.here).length);
  Sky.flush();
  assert(1, _.keys(weather_listeners.here).length);

  c.update({}, {$set: {x: 5}});
  assert_frag("~Before0<!---->Middle~Else~After~", onscreen);
  assert(1, _.keys(weather_listeners.here).length);
  Sky.flush();
  assert(0, _.keys(weather_listeners.here).length);

  document.body.removeChild(onscreen);

  /*
    - passing in an existing query
    - render_empty gets events attached
    - moved preserves events
    - renderlists inside other renderlists work and GC correctly
  */
};
