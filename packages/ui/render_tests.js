var materialize = UI.materialize;
var toHTML = HTML.toHTML;
var toCode = HTML.toJS;

var P = HTML.P;
var CharRef = HTML.CharRef;
var DIV = HTML.DIV;
var Comment = HTML.Comment;
var BR = HTML.BR;
var A = HTML.A;
var UL = HTML.UL;
var LI = HTML.LI;
var SPAN = HTML.SPAN;
var HR = HTML.HR;
var TEXTAREA = HTML.TEXTAREA;
var INPUT = HTML.INPUT;

Tinytest.add("ui - render - basic", function (test) {
  var run = function (input, expectedInnerHTML, expectedHTML, expectedCode) {
    var div = document.createElement("DIV");
    materialize(input, div);
    test.equal(canonicalizeHtml(div.innerHTML), expectedInnerHTML);
    test.equal(toHTML(input), expectedHTML);
    if (typeof expectedCode !== 'undefined')
      test.equal(toCode(input), expectedCode);
  };

  run(P('Hello'),
      '<p>Hello</p>',
      '<p>Hello</p>',
      'HTML.P("Hello")');

  run(null, '', '', 'null');
  run([], '', '', '[]');
  run([null, null], '', '', '[null, null]');

  // Test crazy character references

  // `&zopf;` is "Mathematical double-struck small z" a.k.a. "open-face z"
  run(P(CharRef({html: '&zopf;', str: '\ud835\udd6b'})),
      '<p>\ud835\udd6b</p>',
      '<p>&zopf;</p>',
      'HTML.P(HTML.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}))');

  run(P({id: CharRef({html: '&zopf;', str: '\ud835\udd6b'})}, 'Hello'),
      '<p id="\ud835\udd6b">Hello</p>',
      '<p id="&zopf;">Hello</p>',
      'HTML.P({id: HTML.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"})}, "Hello")');

  run(P({id: [CharRef({html: '&zopf;', str: '\ud835\udd6b'}), '!']}, 'Hello'),
      '<p id="\ud835\udd6b!">Hello</p>',
      '<p id="&zopf;!">Hello</p>',
      'HTML.P({id: [HTML.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}), "!"]}, "Hello")');

  // Test comments

  run(DIV(Comment('Test')),
      '<div><!----></div>', // our innerHTML-canonicalization function kills comment contents
      '<div><!--Test--></div>',
      'HTML.DIV(HTML.Comment("Test"))');

  // Test arrays

  run([P('Hello'), P('World')],
      '<p>Hello</p><p>World</p>',
      '<p>Hello</p><p>World</p>',
      '[HTML.P("Hello"), HTML.P("World")]');

  // Test slightly more complicated structure

  run(DIV({'class': 'foo'}, UL(LI(P(A({href: '#one'}, 'One'))),
                               LI(P('Two', BR(), 'Three')))),
      '<div class="foo"><ul><li><p><a href="#one">One</a></p></li><li><p>Two<br>Three</p></li></ul></div>',
      '<div class="foo"><ul><li><p><a href="#one">One</a></p></li><li><p>Two<br>Three</p></li></ul></div>',
      'HTML.DIV({"class": "foo"}, HTML.UL(HTML.LI(HTML.P(HTML.A({href: "#one"}, "One"))), HTML.LI(HTML.P("Two", HTML.BR(), "Three"))))');


  // Test nully attributes
  run(BR({x: null,
          y: [[], []],
          a: [['']]}),
      '<br a="">',
      '<br a="">',
      'HTML.BR({a: [[""]]})');

  run(BR({
    x: function () { return function () { return []; }; },
    a: function () { return function () { return ''; }; }}),
      '<br a="">',
      '<br a="">');
});

// test that we correctly update the 'value' property on input fields
// rather than the 'value' attribute. the 'value' attribute only sets
// the initial value.
Tinytest.add("ui - render - input - value", function (test) {
  var R = ReactiveVar("hello");
  var div = document.createElement("DIV");
  materialize(INPUT({value: function () { return R.get(); }}), div);
  var inputEl = div.querySelector('input');
  test.equal(inputEl.value, "hello");
  inputEl.value = "goodbye";
  R.set("hola");
  Deps.flush();
  test.equal(inputEl.value, "hola");
});

// test that we correctly update the 'checked' property rather than
// the 'checked' attribute on input fields of type 'checkbox'. the
// 'checked' attribute only sets the initial value.
Tinytest.add("ui - render - input - checked", function (test) {
  var R = ReactiveVar(null);
  var div = document.createElement("DIV");
  materialize(INPUT({type: "checkbox", checked: function () { return R.get(); }}), div);
  var inputEl = div.querySelector('input');
  test.equal(inputEl.checked, false);
  inputEl.checked = true;

  R.set("checked");
  Deps.flush();
  R.set(null);
  Deps.flush();
  test.equal(inputEl.checked, false);
});

Tinytest.add("ui - render - textarea", function (test) {
  var run = function (optNode, text, html, code) {
    if (typeof optNode === 'string') {
      // called with args (text, html, code)
      code = html;
      html = text;
      text = optNode;
      optNode = null;
    }
    var div = document.createElement("DIV");
    var node = TEXTAREA(optNode || text);
    materialize(node, div);

    var value = div.querySelector('textarea').value;
    value = value.replace(/\r\n/g, "\n"); // IE8 substitutes \n with \r\n
    test.equal(value, text);

    test.equal(toHTML(node), html);
    if (typeof code === 'string')
      test.equal(toCode(node), code);
  };

  run('Hello',
      '<textarea>Hello</textarea>',
      'HTML.TEXTAREA("Hello")');

  run('\nHello',
      '<textarea>\n\nHello</textarea>',
      'HTML.TEXTAREA("\\nHello")');

  run('</textarea>',
      '<textarea>&lt;/textarea></textarea>',
      'HTML.TEXTAREA("</textarea>")');

  run(CharRef({html: '&amp;', str: '&'}),
      '&',
      '<textarea>&amp;</textarea>',
      'HTML.TEXTAREA(HTML.CharRef({html: "&amp;", str: "&"}))');

  run(['a', function () { return 'b'; }, 'c'],
      'abc',
      '<textarea>abc</textarea>');

});

Tinytest.add("ui - render - closures", function (test) {

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

// IE strips malformed styles like "bar::d" from the `style`
// attribute. We detect this to adjust expectations for the StyleHandler
// test below.
var malformedStylesAllowed = function () {
  var div = document.createElement("div");
  div.setAttribute("style", "bar::d;");
  return (div.getAttribute("style") === "bar::d;");
};

Tinytest.add("ui - render - closure GC", function (test) {
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

Tinytest.add("ui - render - reactive attributes", function (test) {
  (function () {
    var R = ReactiveVar({'class': ['david gre', CharRef({html: '&euml;', str: '\u00eb'}), 'nspan'],
                         id: 'foo'});

    var spanCode = SPAN({$dynamic: [function () { return R.get(); }]});

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

  // Test styles.
  (function () {
    // Test the case where there is a semicolon in the css attribute.
    var R = ReactiveVar({'style': 'foo: "a;aa"; bar: b;',
      id: 'foo'});

    var spanCode = SPAN({$dynamic: [function () { return R.get(); }]});

    test.equal(toHTML(spanCode), '<span style="foo: &quot;a;aa&quot;; bar: b;" id="foo"></span>');

    test.equal(R.numListeners(), 0);

    var div = document.createElement("DIV");
    materialize(spanCode, div);
    test.equal(canonicalizeHtml(div.innerHTML), '<span id="foo" style="foo: &quot;a;aa&quot;; bar: b"></span>');

    test.equal(R.numListeners(), 1);
    var span = div.firstChild;
    test.equal(span.nodeName, 'SPAN');

    span.setAttribute('style', span.getAttribute('style') + '; jquery-style: hidden');

    R.set({'style': 'foo: "a;zz;aa";', id: 'bar'});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML, true), '<span id="bar" style="foo: &quot;a;zz;aa&quot;; jquery-style: hidden"></span>');
    test.equal(R.numListeners(), 1);

    R.set({});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span style="jquery-style: hidden"></span>');
    test.equal(R.numListeners(), 1);

    $(div).remove();

    test.equal(R.numListeners(), 0);
  })();

  // Test that identical styles are successfully overwritten.
  (function () {

    var R = ReactiveVar({'style': 'foo: a;'});

    var spanCode = SPAN({$dynamic: [function () { return R.get(); }]});

    var div = document.createElement("DIV");
    document.body.appendChild(div);
    materialize(spanCode, div);
    test.equal(canonicalizeHtml(div.innerHTML), '<span style="foo: a"></span>');

    var span = div.firstChild;
    test.equal(span.nodeName, 'SPAN');
    span.setAttribute("style", 'foo: b;');
    test.equal(canonicalizeHtml(div.innerHTML), '<span style="foo: b"></span>');

    R.set({'style': 'foo: c;'});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span style="foo: c"></span>');

    // test malformed styles - different expectations in IE (which
    // strips malformed styles) from other browsers
    R.set({'style': 'foo: a; bar::d;:e; baz: c;'});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML),
      malformedStylesAllowed() ?
               '<span style="foo: a; bar::d; baz: c"></span>' :
               '<span style="foo: a; baz: c"></span>');

    // Test strange styles
    R.set({'style': ' foo: c; constructor: a; __proto__: b;'});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span style="foo: c; constructor: a; __proto__: b"></span>');

    R.set({});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span></span>');

    R.set({'style': 'foo: bar;'});
    Deps.flush();
    test.equal(canonicalizeHtml(div.innerHTML), '<span style="foo: bar"></span>');
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

    var spanCode = SPAN({$dynamic: [function () { return R.get(); }]});

    test.equal(toHTML(spanCode), '<span id="foo" ggg="xyz"></span>');
    test.equal(toCode(SPAN(R.get())),
               'HTML.SPAN({id: "foo", ggg: ["x", ["y", ["z"]]]})');

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

Tinytest.add("ui - render - components", function (test) {
  (function () {
    var counter = 1;
    var buf = [];

    var myComponent = UI.Component.extend({
      init: function () {
        // `this` is the component instance
        var number = counter++;
        this.number = number;

        if (this.parent)
          buf.push('parent of ' + this.number + ' is ' + this.parent.number);

        this.data = function () {
          return this.number;
        };
      },
      created: function () {
        // `this` is the template instance
        buf.push('created ' + this.data);
      },
      render: function () {
        // `this` is the component instance
        return [String(this.number),

                (this.number < 3 ? myComponent : HR())];
      },
      rendered: function () {
        // `this` is the template instance
        var nodeDescr = function (node) {
          if (node.nodeType === 8) // comment
            return '';
          if (node.nodeType === 3) // text
            return node.nodeValue;

          return node.nodeName;
        };

        var start = this.firstNode;
        var end = this.lastNode;
        // skip marker nodes
        while (start !== end && ! nodeDescr(start))
          start = start.nextSibling;
        while (end !== start && ! nodeDescr(end))
          end = end.previousSibling;


        // `this` is the template instance
        buf.push('dom-' + this.data + ' is ' + nodeDescr(start) +'..' +
                 nodeDescr(end));
      },
      destroyed: function () {
        // `this` is the template instance
        buf.push('destroyed ' + this.data);
      }
    });

    var div = document.createElement("DIV");

    materialize(myComponent, div);
    buf.push('---flush---');
    Deps.flush();
    test.equal(buf, ['created 1',
                     'parent of 2 is 1',
                     'created 2',
                     'parent of 3 is 2',
                     'created 3',
                     '---flush---',
                     // (proper order for these has not be thought out:)
                     'dom-1 is 1..HR',
                     'dom-2 is 2..HR',
                     'dom-3 is 3..HR']);

    test.equal(canonicalizeHtml(div.innerHTML), '123<hr>');

    buf.length = 0;
    $(div).remove();
    buf.sort();
    test.equal(buf, ['destroyed 1', 'destroyed 2', 'destroyed 3']);

    // Now use toHTML.  Should still get most of the callbacks (not `rendered`).

    buf.length = 0;
    counter = 1;

    var html = toHTML(myComponent);

    test.equal(buf, ['created 1',
                     'parent of 2 is 1',
                     'created 2',
                     'parent of 3 is 2',
                     'created 3']);

    test.equal(html, '123<hr>');
  })();
});

Tinytest.add("ui - render - findAll", function (test) {
  var found = null;
  var $found = null;

  var myComponent = UI.Component.extend({
    render: function() {
      return DIV([P('first'), P('second')]);
    },
    rendered: function() {
      found = this.findAll('p');
      $found = this.$('p');
    },
  });

  var div = document.createElement("DIV");

  materialize(myComponent, div);
  Deps.flush();

  test.equal(_.isArray(found), true);
  test.equal(_.isArray($found), false);
  test.equal(found.length, 2);
  test.equal($found.length, 2);
});

Tinytest.add("ui - render - reactive attributes 2", function (test) {
  var R1 = ReactiveVar(['foo']);
  var R2 = ReactiveVar(['bar']);

  var spanCode = SPAN({
    blah: function () { return R1.get(); },
    $dynamic: [function () { return { blah: [function () { return R2.get(); }] }; }]
  });

  var div = document.createElement("DIV");
  materialize(spanCode, div);
  var check = function (expected) {
    test.equal(toHTML(spanCode), expected);
    test.equal(canonicalizeHtml(div.innerHTML), expected);
  };
  check('<span blah="bar"></span>');

  test.equal(R1.numListeners(), 1);
  test.equal(R2.numListeners(), 1);

  R2.set([[]]);
  Deps.flush();
  // We combine `['foo']` with what evaluates to `[[[]]]`, which is nully.
  test.equal(spanCode.evaluateAttributes().blah, ["foo"]);
  check('<span blah="foo"></span>');

  R2.set([['']]);
  Deps.flush();
  // We combine `['foo']` with what evaluates to `[[['']]]`, which is non-nully.
  test.equal(spanCode.evaluateAttributes().blah, [[['']]]);
  check('<span blah=""></span>');

  R2.set(null);
  Deps.flush();
  // We combine `['foo']` with `[null]`, which is nully.
  test.equal(spanCode.evaluateAttributes().blah, ['foo']);
  check('<span blah="foo"></span>');

  R1.set([[], []]);
  Deps.flush();
  // We combine two nully values.
  check('<span></span>');

  R1.set([[], ['foo']]);
  Deps.flush();
  check('<span blah="foo"></span>');

  // clean up

  $(div).remove();

  test.equal(R1.numListeners(), 0);
  test.equal(R2.numListeners(), 0);
});

Tinytest.add("ui - render - SVG", function (test) {
  if (! document.createElementNS) {
    // IE 8
    return;
  }

  var fillColor = ReactiveVar('red');
  var classes = ReactiveVar('one two');

  var content = DIV({'class': 'container'}, HTML.SVG(
    {width: 100, height: 100},
    HTML.CIRCLE({cx: 50, cy: 50, r: 40,
                 stroke: 'black', 'stroke-width': 3,
                 'class': function () { return classes.get(); },
                 fill: function () { return fillColor.get(); }})));

  var div = document.createElement("DIV");
  materialize(content, div);

  var circle = div.querySelector('.container > svg > circle');
  test.equal(circle.getAttribute('fill'), 'red');
  test.equal(circle.className.baseVal, 'one two');

  fillColor.set('green');
  classes.set('two three');
  Deps.flush();
  test.equal(circle.getAttribute('fill'), 'green');
  test.equal(circle.className.baseVal, 'two three');

  test.equal(circle.nodeName, 'circle');
  test.equal(circle.namespaceURI, "http://www.w3.org/2000/svg");
  test.equal(circle.parentNode.namespaceURI, "http://www.w3.org/2000/svg");
});

Tinytest.add("ui - UI.render", function (test) {
  var div = document.createElement("DIV");
  document.body.appendChild(div);

  var R = ReactiveVar('aaa');
  var tmpl = UI.Component.extend({
    render: function () {
      var self = this;
      return SPAN(function () {
        return (self.get('greeting') || 'Hello') + ' ' + R.get();
      });
    }
  });

  UI.insert(UI.render(tmpl), div);
  UI.insert(UI.renderWithData(tmpl, {greeting: 'Bye'}), div);
  test.equal(canonicalizeHtml(div.innerHTML),
             "<span>Hello aaa</span><span>Bye aaa</span>");
  R.set('bbb');
  Deps.flush();
  test.equal(canonicalizeHtml(div.innerHTML),
             "<span>Hello bbb</span><span>Bye bbb</span>");

  document.body.removeChild(div);
});

Tinytest.add("ui - UI.getDataContext", function (test) {
  var div = document.createElement("DIV");

  var tmpl = UI.Component.extend({
    render: function () {
      return SPAN();
    }
  });

  UI.insert(UI.renderWithData(tmpl, {foo: "bar"}), div);
  var span = $(div).children('SPAN')[0];
  test.isTrue(span);
  test.equal(UI.getElementData(span), {foo: "bar"});
});

Tinytest.add("ui - UI.render _nestInCurrentComputation flag", function (test) {
  _.each([true, false], function (nest) {

    var firstComputation;
    var rv1 = new ReactiveVar;
    var rv2 = new ReactiveVar;

    // Render a component in an autorun. Save the current computation
    // from the first time we run the render function. Invalidate the
    // autorun, and check whether that stops the computation from the
    // first time the component rendered.

    var tmpl = UI.Component.extend({
      render: function () {
        return function () {
          if (! firstComputation) {
            firstComputation = Deps.currentComputation;
          }
          return rv1.get();
        };
      }
    });

    Deps.autorun(function () {
      rv2.get(); // register a dependency
      UI.render(tmpl, undefined, {
        _nestInCurrentComputation: nest
      });
    });

    rv2.set("foo");
    Deps.flush();

    // If we nested inside the current computation, then we expect the
    // computation from within the render function to have been stopped
    // when the outer computation was invalidated.
    if (nest) {
      test.equal(firstComputation.stopped, true);
    } else {
      test.equal(firstComputation.stopped, false);
    }
  });
});
