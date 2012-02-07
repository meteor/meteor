// XXX SECTION: LiveRange

/******************************************************************************/

var create = function (id, start, end, inner, tag) {
  var ret = new Meteor.ui._LiveRange(tag || 'a', start, end, inner);
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
      var range = new Meteor.ui._LiveRange(tag || 'a', what);
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
var assert_dump = function (expected, actual, tag) {
  assert.equal(dump(actual), expected, "Tree doesn't match");
  if (actual instanceof Meteor.ui._LiveRange)
    check_liverange_integrity(actual);
  else {
    if (actual.firstChild) {
      var range = new Meteor.ui._LiveRange(tag || 'a', actual);
      check_liverange_integrity(range);
      range.destroy();
    }
  }
};

var contained_ranges = function (range) {
  var result = {range: range, children: []};
  var stack = [result];

  range.visit(function (is_start, range) {
    if (is_start) {
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

test("liverange - single node", function () {
  var f = frag("<div id=1></div>");
  var r_a = create("a", f);
  assert.instanceOf(r_a, Meteor.ui._LiveRange);
  assert_dump("<a><1></1></a>", r_a);
  assert_dump("<a><1></1></a>", f);
  assert_contained(r_a, {range: r_a, children: []});

  var r_b = create("b", f);
  assert_dump("<a><1></1></a>", r_a);
  assert_dump("<b><a><1></1></a></b>", r_b);
  assert_dump("<b><a><1></1></a></b>", f);
  assert_contained(r_a, {range: r_a, children: []});
  assert_contained(r_b, {range: r_b, children: [{range: r_a, children: []}]});
  assert.equal(r_a.firstNode(), f.firstChild);
  assert.equal(r_a.lastNode(), f.lastChild);
  assert.equal(r_b.firstNode(), f.firstChild);
  assert.equal(r_b.lastNode(), f.lastChild);

  var ret1 = r_a.replace_contents(frag("<div id=2></div>"));
  assert.equal(ret1.nodeType, 11 /* DocumentFragment */);
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

  assert.equal(r_b.firstNode(), f.firstChild);
  assert.equal(r_b.lastNode(), f.lastChild);
  assert.equal(r_c.firstNode(), f.firstChild);
  assert.equal(r_c.lastNode(), f.lastChild);
  assert.equal(r_e.firstNode(), f.firstChild);
  assert.equal(r_e.lastNode(), f.lastChild);

  r_b.destroy();
  assert_dump("<c><3></3></c>", r_c);
  assert_dump("<e><c><3></3></c></e>", r_e);

  r_e.destroy();
  assert_dump("<c><3></3></c>", r_c);
});

test("liverange - multiple nodes", function () {
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
});

test("liverange - deep visit", function () {

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
});

test("liverange - create inner", function () {
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
});
