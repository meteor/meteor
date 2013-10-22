/******************************************************************************/

var create = function (id, start, end, inner, tag) {
  var ret = new LiveRange(tag || 'a', start, end, inner);
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

  var emit = function (isStart, obj) {
    ret += (isStart ? "<": "</") + obj.id + ">";
  };

  if (typeof what === 'object' && what.nodeType === 11 /* DocumentFragment */) {
    if (what.firstChild) {
      var range = new LiveRange(tag || 'a', what);
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

// actual can be a range or a fragment
var assert_dump = function (test, expected, actual, tag) {
  test.equal(dump(actual), expected, "Tree doesn't match");
  if (actual instanceof LiveRange)
    check_liverange_integrity(actual);
  else {
    if (actual.firstChild) {
      var range = new LiveRange(tag || 'a', actual);
      check_liverange_integrity(range);
      range.destroy();
    }
  }
};

var contained_ranges = function (range) {
  var result = {range: range, children: []};
  var stack = [result];

  range.visit(function (isStart, range) {
    if (isStart) {
      var record = {range: range, children: []};
      stack[stack.length - 1].children.push(record);
      stack.push(record);
    } else
      if (stack.pop().range !== range)
        throw new Error("Overlapping ranges detected");
  });

  return result;
};

var assert_contained = function (r, expected) {
  // one day, fold in the above function (use visit() directly)
  var actual = contained_ranges(r);

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

/******************************************************************************/

Tinytest.add("liverange - single node", function (test) {
  var f = frag("<div id=1></div>");
  var r_a = create("a", f);
  test.instanceOf(r_a, LiveRange);
  assert_dump(test, "<a><1></1></a>", r_a);
  assert_dump(test, "<a><1></1></a>", f);
  assert_contained(r_a, {range: r_a, children: []});

  var r_b = create("b", f);
  assert_dump(test, "<a><1></1></a>", r_a);
  assert_dump(test, "<b><a><1></1></a></b>", r_b);
  assert_dump(test, "<b><a><1></1></a></b>", f);
  assert_contained(r_a, {range: r_a, children: []});
  assert_contained(r_b, {range: r_b, children: [{range: r_a, children: []}]});
  test.equal(r_a.firstNode(), f.firstChild);
  test.equal(r_a.lastNode(), f.lastChild);
  test.equal(r_b.firstNode(), f.firstChild);
  test.equal(r_b.lastNode(), f.lastChild);

  var ret1 = r_a.replaceContents(frag("<div id=2></div>"), true);
  test.equal(ret1.nodeType, 11 /* DocumentFragment */);
  assert_dump(test, "<1></1>", ret1);
  assert_dump(test, "<a><2></2></a>", r_a);
  assert_dump(test, "<b><a><2></2></a></b>", r_b);
  assert_dump(test, "<b><a><2></2></a></b>", f);

  var ret2 = r_b.replaceContents(frag("<div id=3></div>"), true);
  assert_dump(test, "<a><2></2></a>", ret2);
  assert_dump(test, "<a><2></2></a>", r_a);
  assert_dump(test, "<b><3></3></b>", r_b);
  assert_dump(test, "<b><3></3></b>", f);

  r_a.destroy();
  assert_dump(test, "<2></2>", ret2);

  var r_c = create("c", f);
  var r_d = create("d", f);
  var r_e = create("e", f);
  assert_dump(test, "<c><b><3></3></b></c>", r_c);
  assert_dump(test, "<d><c><b><3></3></b></c></d>", r_d);
  assert_dump(test, "<e><d><c><b><3></3></b></c></d></e>", r_e);
  assert_dump(test, "<1></1>", ret1);
  assert_dump(test, "<b><3></3></b>", r_b);

  r_d.destroy();
  assert_dump(test, "<b><3></3></b>", r_b);
  assert_dump(test, "<c><b><3></3></b></c>", r_c);
  assert_dump(test, "<e><c><b><3></3></b></c></e>", r_e);
  assert_dump(test, "<1></1>", ret1);

  assert_contained(r_e,
                   {range: r_e,
                    children: [{range: r_c,
                                children: [{range: r_b, children: []}]}]});

  test.equal(r_b.firstNode(), f.firstChild);
  test.equal(r_b.lastNode(), f.lastChild);
  test.equal(r_c.firstNode(), f.firstChild);
  test.equal(r_c.lastNode(), f.lastChild);
  test.equal(r_e.firstNode(), f.firstChild);
  test.equal(r_e.lastNode(), f.lastChild);

  r_b.destroy();
  assert_dump(test, "<c><3></3></c>", r_c);
  assert_dump(test, "<e><c><3></3></c></e>", r_e);

  r_e.destroy();
  assert_dump(test, "<c><3></3></c>", r_c);

});

Tinytest.add("liverange - empty replace", function (test) {
  var f,r;

  f = frag("<div id=1></div>");
  r = create("z", f);
  test.throws(function() {
    r.replaceContents(frag(""));
  });

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r = create("z", f.childNodes[1]);
  assert_dump(test, "<1></1><z><2></2></z><3></3>", f);
  test.throws(function() {
    r.replaceContents(frag(""));
  });
});

Tinytest.add("liverange - multiple nodes", function (test) {
  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");
  assert_dump(test, "<1></1><2></2><3></3><4></4><5></5>", f);

  var r_a = create("a", f.childNodes[2], f.childNodes[3]);
  assert_dump(test, "<1></1><2></2><a><3></3><4></4></a><5></5>", f);
  assert_dump(test, "<a><3></3><4></4></a>", r_a);

  var r_b = create("b", f.childNodes[3], f.childNodes[3]);
  assert_dump(test, "<1></1><2></2><a><3></3><b><4></4></b></a><5></5>", f);
  assert_dump(test, "<a><3></3><b><4></4></b></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);

  var r_c = create("c", f.childNodes[2], f.childNodes[3]);
  assert_dump(test, "<1></1><2></2><c><a><3></3><b><4></4></b></a></c><5></5>", f);
  assert_dump(test, "<a><3></3><b><4></4></b></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><3></3><b><4></4></b></a></c>", r_c);

  var r_d = create("d", f.childNodes[3], f.childNodes[3]);
  assert_dump(test, "<1></1><2></2><c><a><3></3><d><b><4></4></b></d></a></c><5></5>", f);
  assert_dump(test, "<a><3></3><d><b><4></4></b></d></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><3></3><d><b><4></4></b></d></a></c>", r_c);
  assert_dump(test, "<d><b><4></4></b></d>", r_d);

  var r_e = create("e", f.childNodes[2], f.childNodes[2]);
  assert_dump(test, "<1></1><2></2><c><a><e><3></3></e><d><b><4></4></b></d></a></c><5></5>", f);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump(test, "<d><b><4></4></b></d>", r_d);
  assert_dump(test, "<e><3></3></e>", r_e);

  var r_f = create("f", f.childNodes[2], f.childNodes[3]);
  assert_dump(test, "<1></1><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f><5></5>", f);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump(test, "<d><b><4></4></b></d>", r_d);
  assert_dump(test, "<e><3></3></e>", r_e);
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);

  assert_contained(r_f, {range: r_f, children: [{range: r_c, children: [{range: r_a, children: [{range: r_e, children: []},{range: r_d, children: [{range: r_b, children: []}]}]}]}]});

  var r_g = create("g", f.childNodes[0], f.childNodes[3]);
  var r_h = create("h", f.childNodes[0], f.childNodes[3]);
  var r_i = create("i", f.childNodes[1], f.childNodes[3]);
  assert_dump(test, "<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5>", f);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump(test, "<d><b><4></4></b></d>", r_d);
  assert_dump(test, "<e><3></3></e>", r_e);
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);
  assert_dump(test, "<g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g>", r_g);
  assert_dump(test, "<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h>", r_h);
  assert_dump(test, "<i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i>", r_i);

  var f2 = frag("<div id=6></div><div id=7></div><div id=8></div>");
  f2.childNodes[1].appendChild(f);
  assert_dump(test, "", f);
  assert_dump(test, "<6></6><7><h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5></7><8></8>", f2);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump(test, "<d><b><4></4></b></d>", r_d);
  assert_dump(test, "<e><3></3></e>", r_e);
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);
  assert_dump(test, "<g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g>", r_g);
  assert_dump(test, "<h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h>", r_h);
  assert_dump(test, "<i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i>", r_i);

  var r_j = create("j", f2.childNodes[1], f2.childNodes[2]);
  var r_k = create("k", f2.childNodes[0], f2.childNodes[2]);
  var r_l = create("l", f2.childNodes[0], f2.childNodes[2]);
  assert_dump(test, "<l><k><6></6><j><7><h><g><1></1><i><2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f></i></g></h><5></5></7><8></8></j></k></l>", f2);

  var f3 = frag("<div id=9></div><div id=10></div><div id=11></div>");
  var r_m = create("m", f3.childNodes[0], f3.childNodes[2]);
  var r_n = create("n", f3.childNodes[0], f3.childNodes[0]);
  var r_o = create("o", f3.childNodes[0], f3.childNodes[0]);
  assert_dump(test, "<m><o><n><9></9></n></o><10></10><11></11></m>", f3);

  var ret1 = r_i.replaceContents(f3, true);
  assert_dump(test, "", f3);
  assert_dump(test, "<2></2><f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", ret1);
  assert_dump(test, "<l><k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k></l>", f2);
  assert_dump(test, "<a><e><3></3></e><d><b><4></4></b></d></a>", r_a);
  assert_dump(test, "<b><4></4></b>", r_b);
  assert_dump(test, "<c><a><e><3></3></e><d><b><4></4></b></d></a></c>", r_c);
  assert_dump(test, "<d><b><4></4></b></d>", r_d);
  assert_dump(test, "<e><3></3></e>", r_e);
  assert_dump(test, "<f><c><a><e><3></3></e><d><b><4></4></b></d></a></c></f>", r_f);
  assert_dump(test, "<g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g>", r_g);
  assert_dump(test, "<h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h>", r_h);
  assert_dump(test, "<i><m><o><n><9></9></n></o><10></10><11></11></m></i>",r_i);
  assert_dump(test, "<j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j>", r_j);
  assert_dump(test, "<k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k>", r_k);
  assert_dump(test, "<l><k><6></6><j><7><h><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g></h><5></5></7><8></8></j></k></l>", r_l);

  r_h.destroy();
  assert_dump(test, "<l><k><6></6><j><7><g><1></1><i><m><o><n><9></9></n></o><10></10><11></11></m></i></g><5></5></7><8></8></j></k></l>", f2);
  r_m.destroy();
  assert_dump(test, "<l><k><6></6><j><7><g><1></1><i><o><n><9></9></n></o><10></10><11></11></i></g><5></5></7><8></8></j></k></l>", f2);
  r_n.destroy();
  assert_dump(test, "<l><k><6></6><j><7><g><1></1><i><o><9></9></o><10></10><11></11></i></g><5></5></7><8></8></j></k></l>", f2);
  r_j.destroy();
  assert_dump(test, "<l><k><6></6><7><g><1></1><i><o><9></9></o><10></10><11></11></i></g><5></5></7><8></8></k></l>", f2);
  r_o.destroy();
  assert_dump(test, "<l><k><6></6><7><g><1></1><i><9></9><10></10><11></11></i></g><5></5></7><8></8></k></l>", f2);
  r_g.destroy();
  assert_dump(test, "<l><k><6></6><7><1></1><i><9></9><10></10><11></11></i><5></5></7><8></8></k></l>", f2);
  r_l.destroy();
  assert_dump(test, "<k><6></6><7><1></1><i><9></9><10></10><11></11></i><5></5></7><8></8></k>", f2);
  r_i.destroy();
  assert_dump(test, "<k><6></6><7><1></1><9></9><10></10><11></11><5></5></7><8></8></k>", f2);
  r_k.destroy();
  assert_dump(test, "<6></6><7><1></1><9></9><10></10><11></11><5></5></7><8></8>", f2);
});

Tinytest.add("liverange - deep visit", function (test) {

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

  assert_dump(test, "<d><1><c><2><b><3><4><a><5></5></a></4></3></b></2></c></1></d>",
              f);

  assert_contained(r_d,
                   {range: r_d, children: [{range: r_c, children: [{range: r_b, children: [{range: r_a, children: []}]}]}]});
});

Tinytest.add("liverange - create inner", function (test) {
  // Basics

  var f = frag("<div id=1></div><div id=2></div><div id=3></div><div id=4></div><div id=5></div>");
  assert_dump(test, "<1></1><2></2><3></3><4></4><5></5>", f);

  var r_a = create("a", f.childNodes[2], f.childNodes[4], true);
  assert_dump(test, "<1></1><2></2><a><3></3><4></4><5></5></a>", f);

  var r_b = create("b", f.childNodes[2], f.childNodes[4], true);
  assert_dump(test, "<1></1><2></2><a><b><3></3><4></4><5></5></b></a>", f);

  var r_c = create("c", f.childNodes[2], f.childNodes[4]);
  assert_dump(test, "<1></1><2></2><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  // [{[a] [b]}]

  var r_d = create("d", f.childNodes[0], f.childNodes[0]);
  var r_e = create("e", f.childNodes[1], f.childNodes[1]);
  var r_f = create("f", f.childNodes[0], f.childNodes[1]);
  assert_dump(test, "<f><d><1></1></d><e><2></2></e></f><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_g = create("g", f.childNodes[0], f.childNodes[1], true);
  assert_dump(test, "<f><g><d><1></1></d><e><2></2></e></g></f><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_h = create("h", f.childNodes[0], f.childNodes[1]);
  assert_dump(test, "<h><f><g><d><1></1></d><e><2></2></e></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_i = create("i", f.childNodes[0], f.childNodes[1], true);
  assert_dump(test, "<h><f><g><i><d><1></1></d><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_j = create("j", f.childNodes[0], f.childNodes[0], true);
  assert_dump(test, "<h><f><g><i><d><j><1></1></j></d><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_k = create("k", f.childNodes[0], f.childNodes[0]);
  assert_dump(test, "<h><f><g><i><k><d><j><1></1></j></d></k><e><2></2></e></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);

  var r_l = create("l", f.childNodes[0], f.childNodes[1], true);
  assert_dump(test, "<h><f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f></h><c><a><b><3></3><4></4><5></5></b></a></c>", f);
  assert_dump(test, "<c><a><b><3></3><4></4><5></5></b></a></c>", r_c);
  assert_dump(test, "<b><3></3><4></4><5></5></b>", r_b);
  assert_dump(test, "<a><b><3></3><4></4><5></5></b></a>", r_a);
  assert_dump(test, "<d><j><1></1></j></d>", r_d);
  assert_dump(test, "<e><2></2></e>", r_e);
  assert_dump(test, "<f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f>", r_f);
  assert_dump(test, "<g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g>", r_g);
  assert_dump(test, "<h><f><g><i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i></g></f></h>", r_h);
  assert_dump(test, "<i><l><k><d><j><1></1></j></d></k><e><2></2></e></l></i>", r_i);
  assert_dump(test, "<j><1></1></j>", r_j);
  assert_dump(test, "<k><d><j><1></1></j></d></k>", r_k);
  assert_dump(test, "<l><k><d><j><1></1></j></d></k><e><2></2></e></l>", r_l);

  // [{a b [c]}]
  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[2], f.childNodes[2]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);
  assert_dump(test, "<b><c><1></1><2></2><a><3></3></a></c></b>", f);

  // [{[a] b c}]

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);
  assert_dump(test, "<b><c><a><1></1></a><2></2><3></3></c></b>", f);

  // [{[a b] c}]

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[1]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  r_c = create("c", f.childNodes[0], f.childNodes[2], true);
  assert_dump(test, "<b><c><a><1></1><2></2></a><3></3></c></b>", f);

  // Cases where start and end have no common ranges, and so the
  // balance counter will have to run

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  assert_dump(test, "<b><a><1></1></a><2></2><3></3></b>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[2]);
  r_b = create("b", f.childNodes[0], f.childNodes[0]);
  assert_dump(test, "<a><b><1></1></b><2></2><3></3></a>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[2], f.childNodes[2]);
  r_b = create("b", f.childNodes[0], f.childNodes[2]);
  assert_dump(test, "<b><1></1><2></2><a><3></3></a></b>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[2]);
  r_b = create("b", f.childNodes[2], f.childNodes[2]);
  assert_dump(test, "<a><1></1><2></2><b><3></3></b></a>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[0]);
  r_c = create("c", f.childNodes[2], f.childNodes[2]);
  r_d = create("d", f.childNodes[2], f.childNodes[2]);
  r_e = create("e", f.childNodes[0], f.childNodes[2]);
  assert_dump(test, "<e><b><a><1></1></a></b><2></2><d><c><3></3></c></d></e>", f);

  f = frag("<div id=1></div><div id=2></div><div id=3></div>");
  r_a = create("a", f.childNodes[0], f.childNodes[0]);
  r_b = create("b", f.childNodes[0], f.childNodes[0]);
  r_c = create("c", f.childNodes[2], f.childNodes[2]);
  r_e = create("e", f.childNodes[0], f.childNodes[2]);
  assert_dump(test, "<e><b><a><1></1></a></b><2></2><c><3></3></c></e>", f);

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
      assert_dump(test, "<c><1></1><a><2></2><b><3></3></b></a></c>", f);
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
      assert_dump(test, "<c><b><a><1></1></a><2></2></b><3></3></c>", f);
    }
  );
});

var makeTestPattern = function(codedStr) {
  codedStr = codedStr.replace(/\*/g, '[]');

  var self = {};
  self.tag = '_foo';
  self.ranges = {};

  // set up self.ranges
  var curNode = document.createDocumentFragment();
  var starts = [];
  for(var i=0; i<codedStr.length; i++) {
    var c = codedStr.charAt(i);
    if (/[A-Z]/.test(c)) {
      // open range
      starts.push([curNode, curNode.childNodes.length]);
    } else if (/[a-z]/.test(c)) {
      // close range
      var start = starts.pop();
      var range =
            new LiveRange(
              self.tag, start[0].childNodes[start[1]],
              start[0].lastChild);
      range.letter = c.toUpperCase();
      self.ranges[range.letter] = range;
    } else if (c === '[') {
      curNode.appendChild(document.createElement("DIV"));
      curNode = curNode.lastChild;
    } else if (c === ']') {
      // close node
      curNode = curNode.parentNode;
    }
  }

  self.frag = curNode;

  self.path = function(/*args*/) {
    var node = self.frag;
    _.each(arguments, function(i) {
      node = node.childNodes[i];
    });
    return node;
  };

  self.findRange = function(node) {
    return LiveRange.findRange(self.tag, node);
  };

  self.currentString = function() {
    var buf = [];
    var tempRange = new LiveRange(self.tag, self.frag);
    tempRange.visit(function(isStart, range) {
      buf.push(isStart ?
               range.letter.toUpperCase() :
               range.letter.toLowerCase());
    }, function(isStart, node) {
      buf.push(isStart ? '[' : ']');
    });
    tempRange.destroy();

    return buf.join('').replace(/\[\]/g, '*');
  };

  return self;
};

Tinytest.add("liverange - findParent", function(test) {
  var str = "I*[[AB[H***FDE*ed*fG*gh]*baC*c*]]i*";
  var pat = makeTestPattern(str);
  test.equal(pat.currentString(), str);

  var ranges = pat.ranges;

  test.equal(ranges.E.findParent().letter, 'D');
  test.equal(ranges.D.findParent().letter, 'F');
  test.equal(ranges.F.findParent().letter, 'H');
  test.equal(ranges.H.findParent().letter, 'B');
  test.equal(ranges.B.findParent().letter, 'A');
  test.equal(ranges.A.findParent().letter, 'I');
  test.equal(ranges.I.findParent(), null);

  test.equal(ranges.E.findParent(true).letter, 'D');
  test.equal(ranges.D.findParent(true).letter, 'F');
  test.equal(ranges.F.findParent(true).letter, 'H');
  test.equal(ranges.H.findParent(true), null);
  test.equal(ranges.B.findParent(true).letter, 'A');
  test.equal(ranges.A.findParent(true), null);
  test.equal(ranges.I.findParent(true), null);


  test.equal(pat.findRange(pat.path(0)).letter, 'I');
  test.equal(pat.findRange(pat.path(1)).letter, 'I');
  test.equal(pat.findRange(pat.path(2)), null);

  test.equal(pat.findRange(pat.path(1, 0)).letter, 'I');
  test.equal(pat.findRange(pat.path(1, 0, 0)).letter, 'B');
  test.equal(pat.findRange(pat.path(1, 0, 1)).letter, 'B');
  test.equal(pat.findRange(pat.path(1, 0, 2)).letter, 'C');
  test.equal(pat.findRange(pat.path(1, 0, 3)).letter, 'I');

  test.equal(pat.findRange(pat.path(1, 0, 0, 0)).letter, 'H');
  test.equal(pat.findRange(pat.path(1, 0, 0, 1)).letter, 'H');
  test.equal(pat.findRange(pat.path(1, 0, 0, 2)).letter, 'H');
  test.equal(pat.findRange(pat.path(1, 0, 0, 3)).letter, 'E');
  test.equal(pat.findRange(pat.path(1, 0, 0, 4)).letter, 'F');
  test.equal(pat.findRange(pat.path(1, 0, 0, 5)).letter, 'G');

});

Tinytest.add("liverange - destroy", function(test) {
  var str = "I*[[AB[H***FDE*ed*fG*gh]*baC*c*]]J*ji*";
  var pat = makeTestPattern(str);

  pat.ranges.D.destroy();
  test.equal(pat.currentString(), str.replace(/[Dd]/g, ''));
  pat.ranges.B.destroy();
  test.equal(pat.currentString(), str.replace(/[DdBb]/g, ''));
  pat.ranges.A.destroy();
  test.equal(pat.currentString(), str.replace(/[DdBbAa]/g, ''));

  // recursive destroy
  pat.ranges.F.destroy(true);
  test.equal(pat.currentString(),
             "I*[[[H*****G*gh]*C*c*]]J*ji*");
  pat.ranges.I.destroy(true);
  test.equal(pat.currentString(),
             "*[[[******]***]]**");

  var childrenHaveNoTags = function(node) {
    for(var n = node.firstChild; n; n = n.nextSibling) {
      test.isFalse(node[pat.tag]);
      if (n.firstChild)
        childrenHaveNoTags(n); // recurse
    }
  };

  childrenHaveNoTags(pat.frag);

  // test recursive on single node
  var frag = document.createDocumentFragment();
  var txt = document.createComment("pudding");
  frag.appendChild(txt);
  var rng5 = new LiveRange('_pudding', txt);
  var rng4 = new LiveRange('_pudding', txt);
  var rng3 = new LiveRange('_pudding', txt);
  var rng2 = new LiveRange('_pudding', txt);
  var rng1 = new LiveRange('_pudding', txt);
  rng1.num = 1;
  rng2.num = 2;
  rng3.num = 3;
  rng4.num = 4;
  rng5.num = 5;
  // kill an inner range
  rng4.destroy(true);
  // check that outer ranges are still there
  var buf = [];
  rng1.visit(function(isStart, r) {
    buf.push([isStart, r.num]);
  });
  test.equal(buf, [[true, 2], [true, 3], [false, 3], [false, 2]]);
});
