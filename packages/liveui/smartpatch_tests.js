Tinytest.add("smartpatch - basic", function(test) {

  var Patcher = Meteor.ui._Patcher;

  var div = function(html) {
    var n = document.createElement("DIV");
    n.innerHTML = html;
    return n;
  };
  var tag = function(node, tagName, which) {
    return node.getElementsByTagName(tagName)[which || 0];
  };
  var assert_html = function(actual, expected) {
    actual = (typeof actual === "string" ? actual : actual.innerHTML);
    expected = (typeof expected === "string" ? expected : expected.innerHTML);
    test.equal(actual.toLowerCase(), expected.toLowerCase());
  };

  var x,y,p,ret;

  x = div("<b><i>foo</i><u>bar</u></b>");
  y = div("<b><u>qux</u><s>baz</s></b>");
  p = new Patcher(x, y);
  ret = p.match(tag(x, 'u'), tag(y, 'u'));
  test.isTrue(ret);
  assert_html(x, "<b><u>bar</u></b>");
  ret = p.finish();
  test.isTrue(ret);
  assert_html(x, "<b><u>bar</u><s>baz</s></b>");

  x = div("<b><i>foo</i><u>bar</u></b>");
  y = div("<b><u>qux</u><s>baz</s></b>");
  p = new Patcher(x, y);
  ret = p.finish();
  test.isTrue(ret);
  assert_html(x, "<b><u>qux</u><s>baz</s></b>");

  x = div("<b><i><u>foo</u></i></b><b><i><u><s>bar</s></u></i></b>");
  y = div(
    "1<b>2<i>3<u>foo</u>4</i>5</b>6<b>7<i>8<u>9<s>bar</s>10</u>11</i>12</b>13");
  p = new Patcher(x, y);
  ret = p.match(tag(x, 'u'), tag(y, 'u'));
  test.isTrue(ret);
  assert_html(x, "1<b>2<i>3<u>foo</u></i></b><b><i><u><s>bar</s></u></i></b>");
  ret = p.match(tag(x, 's'), tag(y, 's'));
  test.isTrue(ret);
  assert_html(
    x,
    "1<b>2<i>3<u>foo</u>4</i>5</b>6<b>7<i>8<u>9<s>bar</s></u></i></b>");
  ret = p.finish();
  test.isTrue(ret);
  assert_html(
    x,
    "1<b>2<i>3<u>foo</u>4</i>5</b>6<b>7<i>8<u>9<s>bar</s>10</u>11</i>12</b>13");

  // mismatched parents, detection and recovery

  x = div("<b><i>foo</i><u>bar</u></b>");
  y = div("<b><i>foo</i></b><b><u>bar</u></b>");
  p = new Patcher(x,y);
  ret = p.match(tag(x, 'i'), tag(y, 'i'));
  test.isTrue(ret);
  assert_html(x, "<b><i>foo</i><u>bar</u></b>");
  ret = p.match(tag(x, 'u'), tag(y, 'u'));
  test.isFalse(ret);
  assert_html(x, "<b><i>foo</i><u>bar</u></b>");
  ret = p.finish();
  test.isTrue(ret);
  assert_html(x,"<b><i>foo</i></b><b><u>bar</u></b>");

  x = div("<b><i>foo</i></b><b><u>bar</u></b>");
  y = div("<b><i>foo</i><u>bar</u></b>");
  p = new Patcher(x,y);
  ret = p.match(tag(x, 'i'), tag(y, 'i'));
  test.isTrue(ret);
  assert_html(x, "<b><i>foo</i></b><b><u>bar</u></b>");
  ret = p.match(tag(x, 'u'), tag(y, 'u'));
  test.isFalse(ret);
  assert_html(x, "<b><i>foo</i><u>bar</u></b><b><u>bar</u></b>");
  ret = p.finish();
  test.isTrue(ret);
  assert_html(x, "<b><i>foo</i><u>bar</u></b>");

  // mismatched tag name, detection and recovery
  x = div("<b><i>foo</i><u>bar</u></b>");
  y = div("<i><u>bar</u><s>baz</s></i>");
  p = new Patcher(x, y);
  ret = p.match(tag(x, 'u'), tag(y, 'u'));
  test.isFalse(ret);
  ret = p.finish();
  test.isTrue(ret);
  assert_html(x, "<i><u>bar</u><s>baz</s></i>");

  var LiveRange = Meteor.ui._LiveRange;
  var t = "_foo";
  var liverange = function(start, end, inner) {
    return new LiveRange(t, start, end, inner);
  };

  var rangeTest = function(extras) {
    var aaa = extras[0], zzz = extras[1];
    x = div(aaa+"<b><i>foo</i><u>bar</u></b>"+zzz);
    y = div("<b><u>bar</u><s>baz</s></b>");
    var rng = liverange(tag(y, 'u'));
    var tgt = liverange(tag(x, 'b'));
    p = new Patcher(tgt.containerNode(), y,
                    tgt.firstNode().previousSibling,
                    tgt.lastNode().nextSibling);
    var copyCallback = _.bind(rng.transplant_tag, rng);
    ret = p.match(tag(x, 'u'), tag(y, 'u'), copyCallback);
    test.isTrue(ret);
    assert_html(x, aaa+"<b><u>bar</u></b>"+zzz);
    ret = p.finish();
    test.isTrue(ret);
    assert_html(x, aaa+"<b><u>bar</u><s>baz</s></b>"+zzz);
    test.equal(rng.firstNode(), tag(x, 'u'));
  };

  _.each([["aaa","zzz"], ["",""], ["aaa",""], ["","zzz"]], rangeTest);
});

Tinytest.add("smartpatch - copyAttributes", function(test) {

  var attrTester = function(tagName, initial) {
    var node;
    var allAttrNames = {};
    var lastAttrs;
    var self = {
      copy: function(kv) {
        var buf = [];
        buf.push('<', tagName);
        _.each(kv, function(v,k) {
          allAttrNames[k] = true;
          buf.push(' ', k, '="', v, '"');
        });
        buf.push('></', tagName, '>');
        var nodeHtml = buf.join('');
        var frag = Meteor.ui._htmlToFragment(nodeHtml);
        var n = frag.firstChild;
        if (! node) {
          node = n;
        } else {
          Meteor.ui._Patcher._copyAttributes(node, n);
        }
        lastAttrs = {};
        _.each(allAttrNames, function(v,k) {
          lastAttrs[k] = false;
        });
        _.each(kv, function(v,k) {
          if (k === "style") {
            lastAttrs[k] = n.style.cssText;
          } else {
            lastAttrs[k] = String(v);
          }
        });
        return self;
      },
      check: function() {
        _.each(lastAttrs, function(v,k) {
          var actualAttr;
          if (k === "style") {
            actualAttr = node.style.cssText;
          } else if (k === "class") {
            actualAttr = node.className;
          } else if (k === "checked") {
            actualAttr = String(node.getAttribute(k) || "");
            if (actualAttr === "true")
              actualAttr = "checked"; // save IE's butt
          } else {
            actualAttr = String(node.getAttribute(k) || "");
          }
          var expectedAttr = v || "";
          test.equal(actualAttr, expectedAttr, k);
        });
      },
      node: function() { return node; }
    };
    if (initial)
      self.copy(initial);
    return self;
  };

  var a = attrTester('div',
                     {id:'foo', 'class':'bar',
                      style:'border:1px solid blue;', name:'baz'});
  a.check();
  test.equal(a.node().style.borderColor, "blue");

  a.copy({id: "foo", style:'border:1px solid red'});
  a.check();
  test.equal(a.node().style.borderColor, "red");

  a.copy({id: "foo", 'class':'ha'});
  a.check();
  test.equal(a.node().style.borderColor, "");
  test.equal(a.node().className, "ha");

  var obj = {};
  a.node().nifty = obj;
  a.copy({id: "foo", 'class':'ha hee'});
  a.check();
  test.equal(a.node().nifty, obj, 'nifty'); // test object property preservation


  var c = attrTester('input', {type:'checkbox', name:'foo', checked:'checked'});
  c.check();
  test.equal(c.node().checked, true);
  c.copy({type:'checkbox', name:'foo'});
  c.check();
  test.equal(c.node().checked, false);
  c.copy({type:'checkbox', name:'foo', checked:'checked'});
  c.check();
  test.equal(c.node().checked, true);
  c.copy({type:'checkbox', name:'foo'});
  c.check();
  test.equal(c.node().checked, false);

  var d = attrTester('input', {type:'checkbox', name:'foo'});
  test.equal(c.node().checked, false);
  c.copy({type:'checkbox', name:'foo', checked:'checked'});
  c.check();
  test.equal(c.node().checked, true);
  c.copy({type:'checkbox', name:'foo'});
  c.check();
  test.equal(c.node().checked, false);
  c.copy({type:'checkbox', name:'foo', checked:'checked'});
  c.check();
  test.equal(c.node().checked, true);

  c.copy({type:'checkbox', name:'bar'});
  test.expect_fail(); // changing "name" on a form control won't take in IE
  test.equal(c.node().getAttribute("name"), 'bar');

  c.copy({type:'radio', name:'foo'});
  test.expect_fail(); // changing "type" on a form control won't take in IE
  test.equal(c.node().getAttribute("type"), 'radio');


});

