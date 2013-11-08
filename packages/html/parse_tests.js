var Scanner = HTML._$.Scanner;
var getContent = HTML._$.getContent;

var CharRef = HTML.CharRef;
var Comment = HTML.Comment;
var Special = HTML.Special;

var BR = HTML.Tag.BR;
var HR = HTML.Tag.HR;
var INPUT = HTML.Tag.INPUT;
var A = HTML.Tag.A
var DIV = HTML.Tag.DIV;
var P = HTML.Tag.P;

Tinytest.add("html - parser getContent", function (test) {

  var succeed = function (input, expected) {
    var endPos = input.indexOf('^^^');
    if (endPos < 0)
      endPos = input.length;

    var scanner = new Scanner(input.replace('^^^', ''));
    var result = getContent(scanner);
    test.equal(scanner.pos, endPos);
    test.equal(UI.toCode(result), UI.toCode(expected));
  };

  var fatal = function (input, messageContains) {
    var scanner = new Scanner(input);
    var error;
    try {
      getContent(scanner);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    if (messageContains)
      test.isTrue(messageContains && error.message.indexOf(messageContains) >= 0, error.message);
  };


  succeed('', null);
  succeed('^^^</', null);
  succeed('abc', 'abc');
  succeed('abc^^^</x>', 'abc');
  succeed('a&lt;b', ['a', CharRef({html: '&lt;', str: '<'}), 'b']);
  succeed('<!-- x -->', Comment(' x '));
  succeed('&acE;', CharRef({html: '&acE;', str: '\u223e\u0333'}));
  succeed('&zopf;', CharRef({html: '&zopf;', str: '\ud835\udd6b'}));
  succeed('&&>&g&gt;;', ['&&>&g', CharRef({html: '&gt;', str: '>'}), ';']);

  // Can't have an unescaped `&` if followed by certain names like `gt`
  fatal('&gt&');
  // tests for other failure cases
  fatal('<');

  succeed('<br>', BR());
  succeed('<br/>', BR());
  fatal('<div/>', 'self-close');

  succeed('<hr id=foo>', HR({id:'foo'}));
  succeed('<hr id=&lt;foo&gt;>', HR({id:[CharRef({html:'&lt;', str:'<'}),
                                         'foo',
                                         CharRef({html:'&gt;', str:'>'})]}));
  succeed('<input selected>', INPUT({selected: ''}));
  succeed('<br x=&&&>', BR({x: '&&&'}));
  succeed('<br><br><br>', [BR(), BR(), BR()]);
  succeed('aaa<br>\nbbb<br>\nccc<br>', ['aaa', BR(), '\nbbb', BR(), '\nccc', BR()]);

  succeed('<a></a>', A());
  fatal('<');
  fatal('<a');
  fatal('<a>');
  fatal('<a><');
  fatal('<a></');
  fatal('<a></a');

  succeed('<a href="http://www.apple.com/">Apple</a>',
          A({href: "http://www.apple.com/"}, 'Apple'));

  (function () {
    var A = HTML.getTag('A');
    var B = HTML.getTag('B');
    var C = HTML.getTag('C');
    var D = HTML.getTag('D');

    succeed('<a>1<b>2<c>3<d>4</d>5</c>6</b>7</a>8',
            [A('1', B('2', C('3', D('4'), '5'), '6'), '7'), '8']);
  })();

  fatal('<b>hello <i>there</b> world</i>');

  // XXX support implied end tags in cases allowed by the spec
  fatal('<p>');

  fatal('<a>Foo</a/>');
  fatal('<a>Foo</a b=c>');
});

Tinytest.add("html - parseFragment", function (test) {
  test.equal(UI.toCode(HTML.parseFragment("<div><p id=foo>Hello</p></div>")),
             UI.toCode(DIV(P({id:'foo'}, 'Hello'))));

  test.throws(function() {
    HTML.parseFragment('asdf</a>');
  });
});

Tinytest.add("html - getSpecialTag", function (test) {

  // match only a very simple tag like `{{foo}}`
  var mustache = /^\{\{([a-zA-Z]+)\}\}/;

  // This implementation of `getSpecialTag` looks for "{{" and if it
  // finds it, it will match the regex above or fail fatally trying.
  // The object it returns is opaque to the tokenizer/parser and can
  // be anything we want.
  var getSpecialTag = function (scanner, position) {
    if (! (scanner.peek() === '{' &&
           scanner.rest().slice(0, 2) === '{{'))
      return null;

    var match = mustache.exec(scanner.rest());
    if (! match)
      scanner.fatal("Bad mustache");

    scanner.pos += match[0].length;

    return { name: match[1] };
  };



  var succeed = function (input, expected) {
    var endPos = input.indexOf('^^^');
    if (endPos < 0)
      endPos = input.length;

    var scanner = new Scanner(input.replace('^^^', ''));
    scanner.getSpecialTag = getSpecialTag;
    var result = getContent(scanner);
    test.equal(scanner.pos, endPos);
    test.equal(UI.toCode(result), UI.toCode(expected));
  };

  var fatal = function (input, messageContains) {
    var scanner = new Scanner(input);
    scanner.getSpecialTag = getSpecialTag;
    var error;
    try {
      getContent(scanner);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    if (messageContains)
      test.isTrue(messageContains && error.message.indexOf(messageContains) >= 0, error.message);
  };


  succeed('{{foo}}', Special({name: 'foo'}));

  succeed('<a href=http://www.apple.com/>{{foo}}</a>',
          A({href: "http://www.apple.com/"}, Special({name: 'foo'})));

  // tags not parsed in comments
  succeed('<!--{{foo}}-->', Comment("{{foo}}"));
  succeed('<!--{{foo-->', Comment("{{foo"));

  succeed('&am{{foo}}p;', ['&am', Special({name: 'foo'}), 'p;']);

  // can't start a mustache and not finish it
  fatal('{{foo');
  fatal('<a>{{</a>');

  // no mustache allowed in tag name
  fatal('<{{a}}>');
  fatal('<{{a}}b>');
  fatal('<a{{b}}>');

  // single curly brace is no biggie
  succeed('a{b', 'a{b');
  succeed('<br x={ />', BR({x:'{'}));
  succeed('<br x={foo} />', BR({x:'{foo}'}));
});
