var Scanner = HTMLTools.Scanner;
var getContent = HTMLTools.Parse.getContent;

var CharRef = HTML.CharRef;
var Comment = HTML.Comment;
var Special = HTMLTools.Special;

var BR = HTML.BR;
var HR = HTML.HR;
var INPUT = HTML.INPUT;
var A = HTML.A;
var DIV = HTML.DIV;
var P = HTML.P;
var TEXTAREA = HTML.TEXTAREA;

Tinytest.add("html-tools - parser getContent", function (test) {

  var succeed = function (input, expected) {
    var endPos = input.indexOf('^^^');
    if (endPos < 0)
      endPos = input.length;

    var scanner = new Scanner(input.replace('^^^', ''));
    var result = getContent(scanner);
    test.equal(scanner.pos, endPos);
    test.equal(HTML.toJS(result), HTML.toJS(expected));
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
  succeed('<input selected/>', INPUT({selected: ''}));
  succeed('<input selected />', INPUT({selected: ''}));
  var FOO = HTML.getTag('foo');
  succeed('<foo bar></foo>', FOO({bar: ''}));
  succeed('<foo bar baz ></foo>', FOO({bar: '', baz: ''}));
  succeed('<foo bar=x baz qux=y blah ></foo>',
          FOO({bar: 'x', baz: '', qux: 'y', blah: ''}));
  succeed('<foo bar="x" baz qux="y" blah ></foo>',
          FOO({bar: 'x', baz: '', qux: 'y', blah: ''}));
  fatal('<input bar"baz">');
  fatal('<input x="y"z >');
  fatal('<input x=\'y\'z >');
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
    var A = HTML.getTag('a');
    var B = HTML.getTag('b');
    var C = HTML.getTag('c');
    var D = HTML.getTag('d');

    succeed('<a>1<b>2<c>3<d>4</d>5</c>6</b>7</a>8',
            [A('1', B('2', C('3', D('4'), '5'), '6'), '7'), '8']);
  })();

  fatal('<b>hello <i>there</b> world</i>');

  // XXX support implied end tags in cases allowed by the spec
  fatal('<p>');

  fatal('<a>Foo</a/>');
  fatal('<a>Foo</a b=c>');

  succeed('<textarea>asdf</textarea>', TEXTAREA("asdf"));
  succeed('<textarea x=y>asdf</textarea>', TEXTAREA({x: "y"}, "asdf"));
  succeed('<textarea><p></textarea>', TEXTAREA("<p>"));
  succeed('<textarea>a&amp;b</textarea>',
          TEXTAREA("a", CharRef({html: '&amp;', str: '&'}), "b"));
  succeed('<textarea></textarea</textarea>', TEXTAREA("</textarea"));
  // absorb up to one initial newline, as per HTML parsing spec
  succeed('<textarea>\n</textarea>', TEXTAREA());
  succeed('<textarea>\nasdf</textarea>', TEXTAREA("asdf"));
  succeed('<textarea>\n\nasdf</textarea>', TEXTAREA("\nasdf"));
  succeed('<textarea>\n\n</textarea>', TEXTAREA("\n"));
  succeed('<textarea>\nasdf\n</textarea>', TEXTAREA("asdf\n"));
  succeed('<textarea><!-- --></textarea>', TEXTAREA("<!-- -->"));
  succeed('<tExTaReA>asdf</TEXTarea>', TEXTAREA("asdf"));
  fatal('<textarea>asdf');
  fatal('<textarea>asdf</textarea');
  fatal('<textarea>&davidgreenspan;</textarea>');
  succeed('<textarea>&</textarea>', TEXTAREA("&"));
  succeed('<textarea></textarea  \n<</textarea  \n>asdf',
          [TEXTAREA("</textarea  \n<"), "asdf"]);

  // CR/LF behavior
  succeed('<br\r\n x>', BR({x:''}));
  succeed('<br\r x>', BR({x:''}));
  succeed('<br x="y"\r\n>', BR({x:'y'}));
  succeed('<br x="y"\r>', BR({x:'y'}));
  succeed('<br x=\r\n"y">', BR({x:'y'}));
  succeed('<br x=\r"y">', BR({x:'y'}));
  succeed('<br x\r=\r"y">', BR({x:'y'}));
  succeed('<!--\r\n-->', Comment('\n'));
  succeed('<!--\r-->', Comment('\n'));
  succeed('<textarea>a\r\nb\r\nc</textarea>', TEXTAREA('a\nb\nc'));
  succeed('<textarea>a\rb\rc</textarea>', TEXTAREA('a\nb\nc'));
  succeed('<br x="\r\n\r\n">', BR({x:'\n\n'}));
  succeed('<br x="\r\r">', BR({x:'\n\n'}));
  succeed('<br x=y\r>', BR({x:'y'}));
  fatal('<br x=\r>');
});

Tinytest.add("html-tools - parseFragment", function (test) {
  test.equal(HTML.toJS(HTMLTools.parseFragment("<div><p id=foo>Hello</p></div>")),
             HTML.toJS(DIV(P({id:'foo'}, 'Hello'))));

  _.each(['asdf</br>', '{{!foo}}</br>', '{{!foo}} </br>',
          'asdf</a>', '{{!foo}}</a>', '{{!foo}} </a>'], function (badFrag) {
            test.throws(function() {
              HTMLTools.parseFragment(badFrag);
            }, /Unexpected HTML close tag/);
          });

  (function () {
    var p = HTMLTools.parseFragment('<p></p>');
    test.equal(p.tagName, 'p');
    test.equal(p.attrs, null);
    test.isTrue(p instanceof HTML.Tag);
    test.equal(p.children.length, 0);
  })();

  (function () {
    var p = HTMLTools.parseFragment('<p>x</p>');
    test.equal(p.tagName, 'p');
    test.equal(p.attrs, null);
    test.isTrue(p instanceof HTML.Tag);
    test.equal(p.children.length, 1);
    test.equal(p.children[0], 'x');
  })();

  (function () {
    var p = HTMLTools.parseFragment('<p>x&#65;</p>');
    test.equal(p.tagName, 'p');
    test.equal(p.attrs, null);
    test.isTrue(p instanceof HTML.Tag);
    test.equal(p.children.length, 2);
    test.equal(p.children[0], 'x');

    test.isTrue(p.children[1] instanceof HTML.CharRef);
    test.equal(p.children[1].html, '&#65;');
    test.equal(p.children[1].str, 'A');
  })();

  (function () {
    var pp = HTMLTools.parseFragment('<p>x</p><p>y</p>');
    test.isTrue(pp instanceof Array);
    test.equal(pp.length, 2);

    test.equal(pp[0].tagName, 'p');
    test.equal(pp[0].attrs, null);
    test.isTrue(pp[0] instanceof HTML.Tag);
    test.equal(pp[0].children.length, 1);
    test.equal(pp[0].children[0], 'x');

    test.equal(pp[1].tagName, 'p');
    test.equal(pp[1].attrs, null);
    test.isTrue(pp[1] instanceof HTML.Tag);
    test.equal(pp[1].children.length, 1);
    test.equal(pp[1].children[0], 'y');
  })();

  var scanner = new Scanner('asdf');
  scanner.pos = 1;
  test.equal(HTMLTools.parseFragment(scanner), 'sdf');

  test.throws(function () {
    var scanner = new Scanner('asdf</p>');
    scanner.pos = 1;
    HTMLTools.parseFragment(scanner);
  });
});

Tinytest.add("html-tools - getSpecialTag", function (test) {

  // match a simple tag consisting of `{{`, an optional `!`, one
  // or more ASCII letters, spaces or html tags, and a closing `}}`.
  var mustache = /^\{\{(!?[a-zA-Z 0-9</>]+)\}\}/;

  // This implementation of `getSpecialTag` looks for "{{" and if it
  // finds it, it will match the regex above or fail fatally trying.
  // The object it returns is opaque to the tokenizer/parser and can
  // be anything we want.
  var getSpecialTag = function (scanner, position) {
    if (! (scanner.peek() === '{' && // one-char peek is just an optimization
           scanner.rest().slice(0, 2) === '{{'))
      return null;

    var match = mustache.exec(scanner.rest());
    if (! match)
      scanner.fatal("Bad mustache");

    scanner.pos += match[0].length;

    if (match[1].charAt(0) === '!')
      return null; // `{{!foo}}` is like a comment

    return { stuff: match[1] };
  };



  var succeed = function (input, expected) {
    var endPos = input.indexOf('^^^');
    if (endPos < 0)
      endPos = input.length;

    var scanner = new Scanner(input.replace('^^^', ''));
    scanner.getSpecialTag = getSpecialTag;
    var result;
    try {
      result = getContent(scanner);
    } catch (e) {
      result = String(e);
    }
    test.equal(scanner.pos, endPos);
    test.equal(HTML.toJS(result), HTML.toJS(expected));
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


  succeed('{{foo}}', Special({stuff: 'foo'}));

  succeed('<a href=http://www.apple.com/>{{foo}}</a>',
          A({href: "http://www.apple.com/"}, Special({stuff: 'foo'})));

  // tags not parsed in comments
  succeed('<!--{{foo}}-->', Comment("{{foo}}"));
  succeed('<!--{{foo-->', Comment("{{foo"));

  succeed('&am{{foo}}p;', ['&am', Special({stuff: 'foo'}), 'p;']);

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

  succeed('<br {{x}}>', BR({$specials: [Special({stuff: 'x'})]}));
  succeed('<br {{x}} {{y}}>', BR({$specials: [Special({stuff: 'x'}),
                                              Special({stuff: 'y'})]}));
  succeed('<br {{x}} y>', BR({$specials: [Special({stuff: 'x'})], y:''}));
  fatal('<br {{x}}y>');
  fatal('<br {{x}}=y>');
  succeed('<br x={{y}} z>', BR({x: Special({stuff: 'y'}), z: ''}));
  succeed('<br x=y{{z}}w>', BR({x: ['y', Special({stuff: 'z'}), 'w']}));
  succeed('<br x="y{{z}}w">', BR({x: ['y', Special({stuff: 'z'}), 'w']}));
  succeed('<br x="y {{z}}{{w}} v">', BR({x: ['y ', Special({stuff: 'z'}),
                                             Special({stuff: 'w'}), ' v']}));
  // Slash is parsed as part of unquoted attribute!  This is consistent with
  // the HTML tokenization spec.  It seems odd for some inputs but is probably
  // for cases like `<a href=http://foo.com/>` or `<a href=/foo/>`.
  succeed('<br x={{y}}/>', BR({x: [Special({stuff: 'y'}), '/']}));
  succeed('<br x={{z}}{{w}}>', BR({x: [Special({stuff: 'z'}),
                                       Special({stuff: 'w'})]}));
  fatal('<br x="y"{{z}}>');

  succeed('<br x=&amp;>', BR({x:CharRef({html: '&amp;', str: '&'})}));


  // check tokenization of stache tags with spaces
  succeed('<br {{x 1}}>', BR({$specials: [Special({stuff: 'x 1'})]}));
  succeed('<br {{x 1}} {{y 2}}>', BR({$specials: [Special({stuff: 'x 1'}),
                                                  Special({stuff: 'y 2'})]}));
  succeed('<br {{x 1}} y>', BR({$specials: [Special({stuff: 'x 1'})], y:''}));
  fatal('<br {{x 1}}y>');
  fatal('<br {{x 1}}=y>');
  succeed('<br x={{y 2}} z>', BR({x: Special({stuff: 'y 2'}), z: ''}));
  succeed('<br x=y{{z 3}}w>', BR({x: ['y', Special({stuff: 'z 3'}), 'w']}));
  succeed('<br x="y{{z 3}}w">', BR({x: ['y', Special({stuff: 'z 3'}), 'w']}));
  succeed('<br x="y {{z 3}}{{w 4}} v">', BR({x: ['y ', Special({stuff: 'z 3'}),
                                                 Special({stuff: 'w 4'}), ' v']}));
  succeed('<br x={{y 2}}/>', BR({x: [Special({stuff: 'y 2'}), '/']}));
  succeed('<br x={{z 3}}{{w 4}}>', BR({x: [Special({stuff: 'z 3'}),
                                           Special({stuff: 'w 4'})]}));

  succeed('<p></p>', P());

  succeed('x{{foo}}{{bar}}y', ['x', Special({stuff: 'foo'}),
                               Special({stuff: 'bar'}), 'y']);
  succeed('x{{!foo}}{{!bar}}y', 'xy');
  succeed('x{{!foo}}{{bar}}y', ['x', Special({stuff: 'bar'}), 'y']);
  succeed('x{{foo}}{{!bar}}y', ['x', Special({stuff: 'foo'}), 'y']);
  succeed('<div>{{!foo}}{{!bar}}</div>', DIV());
  succeed('<div>{{!foo}}<br />{{!bar}}</div>', DIV(BR()));
  succeed('<div> {{!foo}} {{!bar}} </div>', DIV("   "));
  succeed('<div> {{!foo}} <br /> {{!bar}}</div>', DIV("  ", BR(), " "));
  succeed('{{! <div></div> }}', null);
  succeed('{{!<div></div>}}', null);

  succeed('', null);
  succeed('{{!foo}}', null);
});
