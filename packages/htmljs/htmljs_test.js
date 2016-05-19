
Tinytest.add("htmljs - getTag", function (test) {
  var FOO = HTML.getTag('foo');
  test.isTrue(HTML.FOO === FOO);
  var x = FOO();

  test.equal(x.tagName, 'foo');
  test.isTrue(x instanceof HTML.FOO);
  test.isTrue(x instanceof HTML.Tag);
  test.equal(x.children, []);
  test.equal(x.attrs, null);

  test.isTrue((new FOO) instanceof HTML.FOO);
  test.isTrue((new FOO) instanceof HTML.Tag);
  test.isFalse((new HTML.P) instanceof HTML.FOO);

  var result = HTML.ensureTag('Bar');
  test.equal(typeof result, 'undefined');
  var BAR = HTML.BAR;
  test.equal(BAR().tagName, 'Bar');
});

Tinytest.add("htmljs - construction", function (test) {
  var A = HTML.getTag('a');
  var B = HTML.getTag('b');
  var C = HTML.getTag('c');

  var a = A(0, B({q:0}, C(A(B({})), 'foo')));
  test.equal(a.tagName, 'a');
  test.equal(a.attrs, null);
  test.equal(a.children.length, 2);
  test.equal(a.children[0], 0);
  var b = a.children[1];
  test.equal(b.tagName, 'b');
  test.equal(b.attrs, {q:0});
  test.equal(b.children.length, 1);
  var c = b.children[0];
  test.equal(c.tagName, 'c');
  test.equal(c.attrs, null);
  test.equal(c.children.length, 2);
  test.equal(c.children[0].tagName, 'a');
  test.equal(c.children[0].attrs, null);
  test.equal(c.children[0].children.length, 1);
  test.equal(c.children[0].children[0].tagName, 'b');
  test.equal(c.children[0].children[0].children.length, 0);
  test.equal(c.children[0].children[0].attrs, {});
  test.equal(c.children[1], 'foo');

  var a2 = new A({m:1}, {n:2}, B(), {o:3}, 'foo');
  test.equal(a2.tagName, 'a');
  test.equal(a2.attrs, {m:1});
  test.equal(a2.children.length, 4);
  test.equal(a2.children[0], {n:2});
  test.equal(a2.children[1].tagName, 'b');
  test.equal(a2.children[2], {o:3});
  test.equal(a2.children[3], 'foo');

  // tests of HTML.isConstructedObject (indirectly)
  test.equal(A({x:1}).children.length, 0);
  var f = function () {};
  test.equal(A(new f).children.length, 1);
  test.equal(A(new Date).children.length, 1);
  test.equal(A({constructor: 'blah'}).children.length, 0);
  test.equal(A({constructor: Object}).children.length, 0);

  test.equal(HTML.toHTML(HTML.CharRef({html: '&amp;', str: '&'})), '&amp;');
  test.throws(function () {
    HTML.CharRef({html: '&amp;'}); // no 'str'
  });
});

Tinytest.add("htmljs - utils", function (test) {

  test.notEqual("\u00c9".toLowerCase(), "\u00c9");
  test.equal(HTMLTools.asciiLowerCase("\u00c9"), "\u00c9");

  test.equal(HTMLTools.asciiLowerCase("Hello There"), "hello there");

  test.isTrue(HTML.isVoidElement("br"));
  test.isFalse(HTML.isVoidElement("div"));
  test.isTrue(HTML.isKnownElement("div"));

});

Tinytest.add("htmljs - details", function (test) {
  test.equal(HTML.toHTML(false), "false");
});
