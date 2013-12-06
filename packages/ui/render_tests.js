var materialize = UI.materialize;
var toHTML = UI.toHTML;
var toCode = UI.toCode;

var P = HTML.Tag.P;
var CharRef = HTML.CharRef;
var DIV = HTML.Tag.DIV;
var Comment = HTML.Comment;
var BR = HTML.Tag.BR;
var A = HTML.Tag.A;
var UL = HTML.Tag.UL;
var LI = HTML.Tag.LI;
var SPAN = HTML.Tag.SPAN;
var HR = HTML.Tag.HR;

Tinytest.add("ui - render - basic", function (test) {
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
      'HTML.Tag.P("Hello")');

  run(null, '', '', 'null');
  run([], '', '', '[]');
  run([null, null], '', '', '[null, null]');

  // Test crazy character references

  // `&zopf;` is "Mathematical double-struck small z" a.k.a. "open-face z"
  run(P(CharRef({html: '&zopf;', str: '\ud835\udd6b'})),
      '<p>\ud835\udd6b</p>',
      '<p>&zopf;</p>',
      'HTML.Tag.P(HTML.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}))');

  run(P({id: CharRef({html: '&zopf;', str: '\ud835\udd6b'})}, 'Hello'),
      '<p id="\ud835\udd6b">Hello</p>',
      '<p id="&zopf;">Hello</p>',
      'HTML.Tag.P({id: HTML.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"})}, "Hello")');

  run(P({id: [CharRef({html: '&zopf;', str: '\ud835\udd6b'}), '!']}, 'Hello'),
      '<p id="\ud835\udd6b!">Hello</p>',
      '<p id="&zopf;!">Hello</p>',
      'HTML.Tag.P({id: [HTML.CharRef({html: "&zopf;", str: "\\ud835\\udd6b"}), "!"]}, "Hello")');

  // Test comments

  run(DIV(Comment('Test')),
      '<div><!----></div>', // our innerHTML-canonicalization function kills comment contents
      '<div><!--Test--></div>',
      'HTML.Tag.DIV(HTML.Comment("Test"))');

  // Test arrays

  run([P('Hello'), P('World')],
      '<p>Hello</p><p>World</p>',
      '<p>Hello</p><p>World</p>',
      '[HTML.Tag.P("Hello"), HTML.Tag.P("World")]');

  // Test slightly more complicated structure

  run(DIV({'class': 'foo'}, UL(LI(P(A({href: '#one'}, 'One'))),
                               LI(P('Two', BR(), 'Three')))),
      '<div class="foo"><ul><li><p><a href="#one">One</a></p></li><li><p>Two<br>Three</p></li></ul></div>',
      '<div class="foo"><ul><li><p><a href="#one">One</a></p></li><li><p>Two<br>Three</p></li></ul></div>',
      'HTML.Tag.DIV({"class": "foo"}, HTML.Tag.UL(HTML.Tag.LI(HTML.Tag.P(HTML.Tag.A({href: "#one"}, "One"))), HTML.Tag.LI(HTML.Tag.P("Two", HTML.Tag.BR(), "Three"))))');
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
               'HTML.Tag.SPAN({id: "foo", ggg: ["x", ["y", ["z"]]]})');

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
    test.equal(buf, ['created 1',
                     'parent of 2 is 1',
                     'created 2',
                     'parent of 3 is 2',
                     'created 3',
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


Tinytest.add("ui - render - emboxValue", function (test) {
  var R = ReactiveVar('ALPHA');

  var numCalcs = [0, 0, 0];

  var firstLetter = UI.emboxValue(function () {
    numCalcs[0]++;
    return R.get().charAt(0);
  });

  var secondLetter = UI.emboxValue(function () {
    numCalcs[1]++;
    return R.get().charAt(1);
  });

  var thirdLetter = UI.emboxValue(function () {
    numCalcs[2]++;
    return R.get().charAt(2);
  });

  var setSink = function (n, value) {
    if (sinks[n] === value)
      sinks[n] += '-error'; // duplicate, shouldn't happen!
    else
      sinks[n] = value;
  };


  test.equal(R.numListeners(), 0);
  test.equal(numCalcs, [0, 0, 0]);

  var comps = [];
  var sinks = [];
  comps[0] = Deps.autorun(function () {
    setSink(0, firstLetter());
  });
  comps[1] = Deps.autorun(function () {
    setSink(1, firstLetter());
  });

  test.equal(R.numListeners(), 1);
  test.equal(numCalcs, [1, 0, 0]);
  test.equal(sinks, ['A', 'A']);

  R.set('APPLE');
  Deps.flush();
  test.equal(R.numListeners(), 1);
  test.equal(numCalcs, [2, 0, 0]);
  test.equal(sinks, ['A', 'A']);

  // This non-reactive call to firstLetter piggybacks on the
  // existing computation, which already has the value handy.
  test.equal(firstLetter(), 'A');
  test.equal(numCalcs, [2, 0, 0]);

  comps[0].stop();
  comps[1].stop();
  Deps.flush();
  test.equal(R.numListeners(), 0);
  test.equal(numCalcs, [2, 0, 0]);
  test.equal(sinks, ['A', 'A']);

  // *This* non-reactive call to firstLetter, on the other hand,
  // happens at a time when the emboxed value has no running
  // computation, so it gets calculated directly.
  test.equal(firstLetter(), 'A');
  test.equal(numCalcs, [3, 0, 0]);
  test.equal(R.numListeners(), 0);

  // Start some new autoruns.
  sinks = [];
  comps[0] = Deps.autorun(function () {
    setSink(0, firstLetter());
  });
  comps[1] = Deps.autorun(function () {
    firstLetter(); // extra call shouldn't matter
    setSink(1, firstLetter());
  });

  test.equal(R.numListeners(), 1);
  test.equal(numCalcs, [4, 0, 0]);
  test.equal(sinks, ['A', 'A']);

  R.set('BANANA');
  Deps.flush();
  test.equal(R.numListeners(), 1);
  // it's important that exactly one calculation happened,
  // which indicates that the inner computation of the
  // emboxValue has been re-run but not torn down and
  // re-established.
  test.equal(numCalcs, [5, 0, 0]);
  test.equal(sinks, ['B', 'B']);

  R.set('CUCUMBER');
  Deps.flush();
  test.equal(R.numListeners(), 1);
  test.equal(numCalcs, [6, 0, 0]);
  test.equal(sinks, ['C', 'C']);

  comps[2] = Deps.autorun(function () {
    setSink(2, secondLetter());
  });

  test.equal(R.numListeners(), 2);
  test.equal(numCalcs, [6, 1, 0]);
  test.equal(sinks, ['C', 'C', 'U']);

  R.set('DOILY');
  Deps.flush();
  test.equal(R.numListeners(), 2);
  test.equal(numCalcs, [7, 2, 0]);
  test.equal(sinks, ['D', 'D', 'O']);

  comps[3] = Deps.autorun(function () {
    setSink(3, firstLetter() + secondLetter() + thirdLetter());
  });

  test.equal(R.numListeners(), 3);
  test.equal(numCalcs, [7, 2, 1]);
  test.equal(sinks, ['D', 'D', 'O', 'DOI']);


  R.set('ENVY');
  Deps.flush();
  test.equal(R.numListeners(), 3);
  test.equal(numCalcs, [8, 3, 2]);
  test.equal(sinks, ['E', 'E', 'N', 'ENV']);

  R.set('EMPTY');
  Deps.flush();
  test.equal(R.numListeners(), 3);
  test.equal(numCalcs, [9, 4, 3]);
  test.equal(sinks, ['E', 'E', 'M', 'EMP']);

  comps[0].stop();
  Deps.flush();
  // comps[3] still listens to first, second, and third, which
  // listen to R.
  test.equal(R.numListeners(), 3);

  comps[1].stop();
  Deps.flush();
  test.equal(R.numListeners(), 3);

  comps[2].stop();
  Deps.flush();
  test.equal(R.numListeners(), 3);

  comps[3].stop();
  test.equal(firstLetter() + secondLetter() + thirdLetter(), 'EMP');
  Deps.flush();
  // BAM, all listeners gone!
  test.equal(R.numListeners(), 0);

  ////// Test non-function case

  test.equal(UI.emboxValue(3)(), 3);
  test.equal(UI.emboxValue(null)(), null);
  test.equal(UI.emboxValue({x:1})(), {x:1});
});