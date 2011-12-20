Results = new Sky.Collection;

var next_result = 0;

_.each(["begin", "ok", "fail"], function (what) {
  this[what] = function (message) {
    Results.insert({n: next_result++, message: message, type: what});
  };
});

Sky.startup(function () {
  _.each([test_single, test_multi, test_deep_visit], function (f) {
    var run = function () {
      f(true);
      f(false);
    };

    run();
    /*
    try {
      run();
    } catch (e) {
      Results.insert({n: next_result++, type: "exception",
                      message: "Exception: " + e.name + ": " + e.message});
      throw e;
    }*/
  });
  begin("end");
});

Template.results.results = function () {
  return Results.find({}, {sort: {n: 1}});
};

Template.results.type_is = function (arg) {
  return this.type === arg;
};

assert = function (expected, actual, message) {
  if (!(expected instanceof Node)) {
    expected = JSON.stringify(expected);
    actual = JSON.stringify(actual);
  }

  if (expected !== actual) {
    debugger;
    Results.insert({n: next_result++, type: "assert",
                    message: message || "Assert fail",
                    expected: expected, actual: actual});
  }
};

var create = function (id, start, end, fast, tag) {
  var ret = new Sky.ui._LiveRange(tag || 'a', start, end, fast);
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

var test_single = function (fast) {
  begin("single node" + (fast ? " fast" : ""));

  var f = frag("<div id=1></div>");
  var r_a = create("a", f, fast);
  assert(true, r_a instanceof Sky.ui._LiveRange);
  assert_dump("<a><1></1></a>", r_a);
  assert_dump("<a><1></1></a>", f);
  assert_contained(r_a, {range: r_a, children: []});

  var r_b = create("b", f, fast);
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
  assert(true, ret1 instanceof DocumentFragment);
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

  var r_c = create("c", f, fast);
  var r_d = create("d", f, fast);
  var r_e = create("e", f, fast);
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

var test_multi = function (fast) {
  begin("multiple nodes" + (fast ? " fast" : ""));

  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");
  assert_dump("<1></1><2></2><3></3><4></4><5></5>", f);

  var r_a = create("a", f.childNodes[2], f.childNodes[3], fast);
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

  var r_j = create("j", f2.childNodes[1], f2.childNodes[2], fast);
  var r_k = create("k", f2.childNodes[0], f2.childNodes[2], fast);
  var r_l = create("l", f2.childNodes[0], f2.childNodes[2], fast);
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

var test_deep_visit = function (fast) {
  begin("deep visit" + (fast ? " fast" : ""));

  var f = frag("<div id=1><div id=2><div id=3><div id=4><div id=5></div></div></div></div></div>");

  var dive = function (f, count) {
    for (var i = 0; i < count; i ++)
      f = f.firstChild;
    return f;
  };

  var r_a = create("a", dive(f, 5), dive(f, 5), fast);
  var r_b = create("b", dive(f, 3), dive(f, 3), fast);
  var r_c = create("c", dive(f, 2), dive(f, 2), fast);
  var r_d = create("d", f);

  assert_dump("<d><1><c><2><b><3><4><a><5></5></a></4></3></b></2></c></1></d>",
              f);

  assert_contained(r_d,
                   {range: r_d, children: [{range: r_c, children: [{range: r_b, children: [{range: r_a, children: []}]}]}]});
};
