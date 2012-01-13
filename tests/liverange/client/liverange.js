Results = new Sky.Collection;

var next_result = 0;

_.each(["section", "begin", "ok", "fail"], function (what) {
  this[what] = function (message) {
    Results.insert({n: next_result++, message: message, type: what});
  };
});

Sky.startup(function () {
  section("Meta tests");
  test_try_all_orders();

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

var isNode = function (o) {
  return (typeof Node === "object" ? o instanceof Node :
          (typeof o === "object" && typeof o.nodeType === "number" &&
           typeof o.nodeName==="string"));
};

var assert = function (expected, actual, message) {
  if (!isNode(expected)) {
    expected = JSON.stringify(expected);
    actual = JSON.stringify(actual);
  }

  if (expected !== actual) {
    // debugger;
    Results.insert({n: next_result++, type: "assert",
                    message: message || "Assert fail",
                    expected: expected, actual: actual});
  }
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

  if (typeof DocumentFragment !== 'undefined' ?
      what instanceof DocumentFragment : what instanceof HTMLDocument) {
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

// Given a set of functions, run them in every possible order
// (permutation).
//
// options:
// - functions: an array of functions
// - before: function to run before each permutation
// - after: function to run after each permutation

var try_all_orders = function (options) {
  var before = options.before || function () {};
  var after = options.after || function () {};

  var pick = function (chosen, remaining) {
    if (remaining.length === 0) {
      before();
      _.each(chosen, function (f) { f(); });
      after();
    } else {
      for (var i = 0; i < remaining.length; i++) {
        chosen.push(remaining[i]);
        pick(chosen, remaining.slice(0, i).concat(remaining.slice(i + 1)));
        chosen.pop();
      }
    }
  };

  pick([], options.functions || []);
};

/******************************************************************************/

var test_try_all_orders = function () {
  begin("try_all_orders");

  var out = "";
  try_all_orders({
    functions: [
      function () {out += "A";},
      function () {out += "B";},
      function () {out += "C";},
    ],
    before: function () {out += ":";},
    after: function () {out += ".";},
  });

  assert(":ABC.:ACB.:BAC.:BCA.:CAB.:CBA.", out);

  var test = function (n) {
    var fs = [];
    var seq = "";
    var seen = {};

    for (var i = 0; i < n; i++)
      fs.push(_.bind(function (x) { seq += x + "_"; }, null, i));
    try_all_orders({
      functions: fs,
      before: function () {seq = "";},
      after: function () {
        if (seq in seen)
          throw new Error("duplicate permutation");
        seen[seq] = true;
      }
    });

    var expected_count = 1;
    for (var i = n; i >= 1; i--)
      expected_count *= i;
    assert(expected_count, _.keys(seen).length);
  };

  for (var i = 1; i <= 5; i++)
    test(i);
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
  assert(true, typeof DocumentFragment !== 'undefined' ?
         ret1 instanceof DocumentFragment : ret1 instanceof HTMLDocument);
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

  try_all_orders({
    before: function () {
      f = frag("<div id=1></div><div id=2></div><div id=3></div>");
    },
    functions: [
      function () { create("a", f.childNodes[1], f.childNodes[2]); },
      function () { create("b", f.childNodes[2], f.childNodes[2]); },
      function () { create("c", f.childNodes[0], f.childNodes[2]); }
    ],
    after: function () {
      assert_dump("<c><1></1><a><2></2><b><3></3></b></a></c>", f);
    }
  });

  try_all_orders({
    before: function () {
      f = frag("<div id=1></div><div id=2></div><div id=3></div>");
    },
    functions: [
      function () { create("a", f.childNodes[0], f.childNodes[0]); },
      function () { create("b", f.childNodes[0], f.childNodes[1]); },
      function () { create("c", f.childNodes[0], f.childNodes[2]); }
    ],
    after: function () {
      assert_dump("<c><b><a><1></1></a><2></2></b><3></3></c>", f);
    }
  });
}


/******************************************************************************/

var assert_frag = function (expected, actual) {
  var actual_dump = '';

  var dump_children = function (node) {
    for (var child = node.firstChild; child; child = child.nextSibling)
      dump(child);
  };

  var dump = function (node) {
    if (node.nodeType === 8) /* comment */
      actual_dump += "<!---->";
    else {
      actual_dump += '<' + node.id + '>';
      dump_children(node);
      actual_dump += '</' + node.id + '>';
    }
  };

  dump_children(actual);
  assert(expected, actual_dump, "Fragments don't match");

  if (actual.firstChild) {
    /* XXX get Sky.ui._tag in a cleaner way */
    var range = new Sky.ui._LiveRange(Sky.ui._tag, actual);
    check_integrity(range);
    range.destroy();
  }
};

var test_render = function () {
  // XXX write tests for render, especially garbage collection
  // check that it's safe from GC until flush
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
  try_all_orders({
    before: function () {
      c.remove();
      parts = [];
      assert_frag("<empty></empty>", r);
    },
    functions: [
      _.bind(do_insert, null, "D"),
      _.bind(do_insert, null, "E"),
      _.bind(do_insert, null, "F"),
      _.bind(do_insert, null, "G")
    ],
    after: function () {
      assert_frag("<D></D><E></E><F></F><G></G>", r);
    }
  });

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
  try_all_orders({
    before: function () {
      parts = {};
      _.each(["D", "E", "F", "G"], function (id) {
        c.insert({id: id});
        parts["<" + id + "></" + id + ">"] = true;
      });
      assert_frag("<D></D><E></E><F></F><G></G>", r);
    },
    functions: [
      _.bind(do_remove, null, "D"),
      _.bind(do_remove, null, "E"),
      _.bind(do_remove, null, "F"),
      _.bind(do_remove, null, "G")
    ],
    after: function () {
      assert_frag("<empty></empty>", r);
    }
  });

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



  /*
    - passing in an existing query
    - render_empty gets events attached
    - correct cleanup/GC
    - moved doesn't GC, and preserves events
    - multiple elements in a rendered fragment
    - flush kills it!

    - #each with a findlive handle
  */
};
