var materialize = UI.materialize;
var toHTML = UI.toHTML;
var toCode = UI.toCode;

var P = UI.Tag.P;
var CharRef = UI.Tag.CharRef;
var DIV = UI.Tag.DIV;
var Comment = UI.Tag.Comment;
var BR = UI.Tag.BR;
var A = UI.Tag.A;
var UL = UI.Tag.UL;
var LI = UI.Tag.LI;
var SPAN = UI.Tag.SPAN;

Tinytest.add("ui - render2 - basic", function (test) {
  var run = function (input, expectedInnerHTML, expectedHTML, expectedCode) {
    var div = document.createElement("DIV");
    materialize(input, div);
    test.equal(canonicalizeHtml(div.innerHTML), expectedInnerHTML);
    test.equal(toHTML(input), expectedHTML);
    test.equal(toCode(input), expectedCode);
  };

  run(P('Hello'),
      '<p>Hello</p>',
      '<p>Hello</p>',
      'UI.Tag.P("Hello")');

  // Test crazy character references

  // `&zopf;` is "Mathematical double-struck small z" a.k.a. "open-face z"
  run(P(CharRef({html: '&zopf;', str: '\ud835\udd6b'})),
      '<p>\ud835\udd6b</p>',
      '<p>&zopf;</p>',
      'UI.Tag.P(UI.Tag.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}))');

  run(P({id: CharRef({html: '&zopf;', str: '\ud835\udd6b'})}, 'Hello'),
      '<p id="\ud835\udd6b">Hello</p>',
      '<p id="&zopf;">Hello</p>',
      'UI.Tag.P({id: UI.Tag.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"})}, "Hello")');

  run(P({id: [CharRef({html: '&zopf;', str: '\ud835\udd6b'}), '!']}, 'Hello'),
      '<p id="\ud835\udd6b!">Hello</p>',
      '<p id="&zopf;!">Hello</p>',
      'UI.Tag.P({id: [UI.Tag.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}), "!"]}, "Hello")');

  // Test comments

  run(DIV(Comment('Test')),
      '<div><!----></div>', // our innerHTML-canonicalization function kills comment contents
      '<div><!--Test--></div>',
      'UI.Tag.DIV(UI.Tag.Comment("Test"))');

  // Test arrays

  run([P('Hello'), P('World')],
      '<p>Hello</p><p>World</p>',
      '<p>Hello</p><p>World</p>',
      '[UI.Tag.P("Hello"), UI.Tag.P("World")]');

  // Test slightly more complicated structure

  run(DIV({'class': 'foo'}, UL(LI(P(A({href: '#one'}, 'One'))),
                               LI(P('Two', BR(), 'Three')))),
      '<div class="foo"><ul><li><p><a href="#one">One</a></p></li><li><p>Two<br>Three</p></li></ul></div>',
      '<div class="foo"><ul><li><p><a href="#one">One</a></p></li><li><p>Two<br>Three</p></li></ul></div>',
      'UI.Tag.DIV({"class": "foo"}, UI.Tag.UL(UI.Tag.LI(UI.Tag.P(UI.Tag.A({href: "#one"}, "One"))), UI.Tag.LI(UI.Tag.P("Two", UI.Tag.BR(), "Three"))))');
});

Tinytest.add("ui - render2 - closures", function (test) {

  // Reactively change a text node
  (function () {
    var R = ReactiveVar('Hello');
    var test1 = P(function () { return R.get(); });

    test.equal(toHTML(test1), '<p>Hello</p>');

    var div = document.createElement("DIV");
    materialize(test1, div);
    test.equal(canonicalizeHtml(div.innerHTML), "<p>Hello</p>");

    R.set('World');
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), "<p>World</p>");
  })();

  // Reactively change an array of text nodes
  (function () {
    var R = ReactiveVar(['Hello', ' World']);
    var test1 = P(function () { return R.get(); });

    test.equal(toHTML(test1), '<p>Hello World</p>');

    var div = document.createElement("DIV");
    materialize(test1, div);
    test.equal(canonicalizeHtml(div.innerHTML), "<p>Hello World</p>");

    R.set(['Goodbye', ' World']);
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), "<p>Goodbye World</p>");
  })();

});

Tinytest.add("ui - render2 - closure GC", function (test) {
  // test that removing parent element removes listeners and stops autoruns.
  (function () {
    var R = ReactiveVar('Hello');
    var test1 = P(function () { return R.get(); });

    var div = document.createElement("DIV");
    materialize(test1, div);
    test.equal(canonicalizeHtml(div.innerHTML), "<p>Hello</p>");

    R.set('World');
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), "<p>World</p>");

    test.equal(R.numListeners(), 1);

    $(div).remove();

    test.equal(R.numListeners(), 0);

    R.set('Steve');
    Deps.flush();
    // should not have changed:
    test.equal(canonicalizeHtml(div.innerHTML), "<p>World</p>");
  })();

});

Tinytest.add("ui - render2 - reactive attributes", function (test) {
  (function () {
    var R = ReactiveVar({'class': ['david gre', CharRef({html: '&euml;', str: '\u00eb'}), 'nspan'],
                         id: 'foo'});

    var spanCode = SPAN({$attrs: function () { return R.get(); }});
    test.equal(typeof spanCode.attrs, 'function');

    test.equal(toHTML(spanCode), '<span class="david gre&euml;nspan" id="foo"></span>');

    test.equal(R.numListeners(), 0);

    var div = document.createElement("DIV");
    materialize(spanCode, div);
    test.equal(canonicalizeHtml(div.innerHTML), '<span class="david gre\u00ebnspan" id="foo"></span>');

    test.equal(R.numListeners(), 1);

    var span = div.firstChild;
    test.equal(span.nodeName, 'SPAN');
    span.className += ' blah';

    R.set({'class': 'david smith', id: 'bar'});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span class="david blah smith" id="bar"></span>');
    test.equal(R.numListeners(), 1);

    R.set({});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span class="blah"></span>');
    test.equal(R.numListeners(), 1);

    $(div).remove();

    test.equal(R.numListeners(), 0);
  })();

  // Test `null`, `undefined`, and `[]` attributes
  (function () {
    var R = ReactiveVar({id: 'foo',
                         aaa: null,
                         bbb: undefined,
                         ccc: [],
                         ddd: [null],
                         eee: [undefined],
                         fff: [[]],
                         ggg: ['x', ['y', ['z']]]});

    var spanCode = SPAN({$attrs: function () { return R.get(); }});

    test.equal(toHTML(spanCode), '<span id="foo" ggg="xyz"></span>');
    test.equal(toCode(SPAN(R.get())),
               'UI.Tag.SPAN({id: "foo", ggg: ["x", ["y", ["z"]]]})');

    var div = document.createElement("DIV");
    materialize(spanCode, div);
    var span = div.firstChild;
    test.equal(span.nodeName, 'SPAN');

    test.equal(canonicalizeHtml(div.innerHTML), '<span ggg="xyz" id="foo"></span>');
    R.set({id: 'foo', ggg: [[], [], []]});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span id="foo"></span>');

    R.set({id: 'foo', ggg: null});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span id="foo"></span>');

    R.set({id: 'foo', ggg: ''});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span ggg="" id="foo"></span>');

    $(span).remove();

    test.equal(R.numListeners(), 0);
  })();
});