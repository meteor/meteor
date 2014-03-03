var Scanner = HTMLTools.Scanner;
var getComment = HTMLTools.Parse.getComment;
var getDoctype = HTMLTools.Parse.getDoctype;
var getHTMLToken = HTMLTools.Parse.getHTMLToken;

// "tokenize" is not really a great operation for real use, because
// it ignores the special content rules for tags like "style" and
// "script".
var tokenize = function (input) {
  var scanner = new Scanner(input);
  var tokens = [];
  while (! scanner.isEOF()) {
    var token = getHTMLToken(scanner);
    if (token)
      tokens.push(token);
  }

  return tokens;
};


Tinytest.add("html-tools - comments", function (test) {
  var succeed = function (input, content) {
    var scanner = new Scanner(input);
    var result = getComment(scanner);
    test.isTrue(result);
    test.equal(scanner.pos, content.length + 7);
    test.equal(result, {
      t: 'Comment',
      v: content
    });
  };

  var ignore = function (input) {
    var scanner = new Scanner(input);
    var result = getComment(scanner);;
    test.isFalse(result);
    test.equal(scanner.pos, 0);
  };

  var fatal = function (input, messageContains) {
    var scanner = new Scanner(input);
    var error;
    try {
      getComment(scanner);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    if (error)
      test.isTrue(messageContains && error.message.indexOf(messageContains) >= 0, error.message);
  };

  test.equal(getComment(new Scanner("<!-- hello -->")),
             { t: 'Comment', v: ' hello ' });

  ignore("<!DOCTYPE>");
  ignore("<!-a");
  ignore("<--");
  ignore("<!");
  ignore("abc");
  ignore("<a");

  fatal('<!--', 'Unclosed');
  fatal('<!---', 'Unclosed');
  fatal('<!----', 'Unclosed');
  fatal('<!-- -', 'Unclosed');
  fatal('<!-- --', 'Unclosed');
  fatal('<!-- -- abcd', 'Unclosed');
  fatal('<!-- ->', 'Unclosed');
  fatal('<!-- a--b -->', 'cannot contain');
  fatal('<!--x--->', 'must end at first');

  fatal('<!-- a\u0000b -->', 'cannot contain');
  fatal('<!--\u0000 x-->', 'cannot contain');

  succeed('<!---->', '');
  succeed('<!---x-->', '-x');
  succeed('<!--x-->', 'x');
  succeed('<!-- hello - - world -->', ' hello - - world ');
});

Tinytest.add("html-tools - doctype", function (test) {
  var succeed = function (input, expectedProps) {
    var scanner = new Scanner(input);
    var result = getDoctype(scanner);
    test.isTrue(result);
    test.equal(scanner.pos, result.v.length);
    test.equal(input.slice(0, result.v.length), result.v);
    var actualProps = _.extend({}, result);
    delete actualProps.t;
    delete actualProps.v;
    test.equal(actualProps, expectedProps);
  };

  var fatal = function (input, messageContains) {
    var scanner = new Scanner(input);
    var error;
    try {
      getDoctype(scanner);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    if (messageContains)
      test.isTrue(error.message.indexOf(messageContains) >= 0, error.message);
  };

  test.equal(getDoctype(new Scanner("<!DOCTYPE html>x")),
             { t: 'Doctype',
               v: '<!DOCTYPE html>',
               name: 'html' });

  test.equal(getDoctype(new Scanner("<!DOCTYPE html SYSTEM 'about:legacy-compat'>x")),
             { t: 'Doctype',
               v: "<!DOCTYPE html SYSTEM 'about:legacy-compat'>",
               name: 'html',
               systemId: 'about:legacy-compat' });

  test.equal(getDoctype(new Scanner("<!DOCTYPE html PUBLIC '-//W3C//DTD HTML 4.0//EN'>x")),
             { t: 'Doctype',
               v: "<!DOCTYPE html PUBLIC '-//W3C//DTD HTML 4.0//EN'>",
               name: 'html',
               publicId: '-//W3C//DTD HTML 4.0//EN' });

  test.equal(getDoctype(new Scanner("<!DOCTYPE html PUBLIC '-//W3C//DTD HTML 4.0//EN' 'http://www.w3.org/TR/html4/strict.dtd'>x")),
             { t: 'Doctype',
               v: "<!DOCTYPE html PUBLIC '-//W3C//DTD HTML 4.0//EN' 'http://www.w3.org/TR/html4/strict.dtd'>",
               name: 'html',
               publicId: '-//W3C//DTD HTML 4.0//EN',
               systemId: 'http://www.w3.org/TR/html4/strict.dtd' });

  succeed('<!DOCTYPE html>', {name: 'html'});
  succeed('<!DOCTYPE htML>', {name: 'html'});
  succeed('<!DOCTYPE HTML>', {name: 'html'});
  succeed('<!doctype html>', {name: 'html'});
  succeed('<!doctYPE html>', {name: 'html'});
  succeed('<!DOCTYPE html \u000c>', {name: 'html'});
  fatal('<!DOCTYPE', 'Expected space');
  fatal('<!DOCTYPE ', 'Malformed DOCTYPE');
  fatal('<!DOCTYPE  ', 'Malformed DOCTYPE');
  fatal('<!DOCTYPE>', 'Expected space');
  fatal('<!DOCTYPE >', 'Malformed DOCTYPE');
  fatal('<!DOCTYPE\u0000', 'Expected space');
  fatal('<!DOCTYPE \u0000', 'Malformed DOCTYPE');
  fatal('<!DOCTYPE html\u0000>', 'Malformed DOCTYPE');
  fatal('<!DOCTYPE html', 'Malformed DOCTYPE');

  succeed('<!DOCTYPE html SYSTEM "about:legacy-compat">', {name: 'html', systemId: 'about:legacy-compat'});
  succeed('<!doctype HTML system "about:legacy-compat">', {name: 'html', systemId: 'about:legacy-compat'});
  succeed("<!DOCTYPE html SYSTEM 'about:legacy-compat'>", {name: 'html', systemId: 'about:legacy-compat'});
  succeed("<!dOcTyPe HtMl sYsTeM 'about:legacy-compat'>", {name: 'html', systemId: 'about:legacy-compat'});
  succeed('<!DOCTYPE  html\tSYSTEM\t"about:legacy-compat"   \t>', {name: 'html', systemId: 'about:legacy-compat'});
  fatal('<!DOCTYPE html SYSTE "about:legacy-compat">', 'Expected PUBLIC or SYSTEM');
  fatal('<!DOCTYPE html SYSTE', 'Expected PUBLIC or SYSTEM');
  fatal('<!DOCTYPE html SYSTEM"about:legacy-compat">', 'Expected space');
  fatal('<!DOCTYPE html SYSTEM');
  fatal('<!DOCTYPE html SYSTEM ');
  fatal('<!DOCTYPE html SYSTEM>');
  fatal('<!DOCTYPE html SYSTEM >');
  fatal('<!DOCTYPE html SYSTEM ">">');
  fatal('<!DOCTYPE html SYSTEM "\u0000about:legacy-compat">');
  fatal('<!DOCTYPE html SYSTEM "about:legacy-compat\u0000">');
  fatal('<!DOCTYPE html SYSTEM "');
  fatal('<!DOCTYPE html SYSTEM "">');
  fatal('<!DOCTYPE html SYSTEM \'');
  fatal('<!DOCTYPE html SYSTEM\'a\'>');
  fatal('<!DOCTYPE html SYSTEM about:legacy-compat>');

  succeed('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN">',
          { name: 'html',
            publicId: '-//W3C//DTD HTML 4.0//EN'});
  succeed('<!DOCTYPE html PUBLIC \'-//W3C//DTD HTML 4.0//EN\'>',
          { name: 'html',
            publicId: '-//W3C//DTD HTML 4.0//EN'});
  succeed('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN" "http://www.w3.org/TR/REC-html40/strict.dtd">',
          { name: 'html',
            publicId: '-//W3C//DTD HTML 4.0//EN',
            systemId: 'http://www.w3.org/TR/REC-html40/strict.dtd'});
  succeed('<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0//EN" \'http://www.w3.org/TR/REC-html40/strict.dtd\'>',
          { name: 'html',
            publicId: '-//W3C//DTD HTML 4.0//EN',
            systemId: 'http://www.w3.org/TR/REC-html40/strict.dtd'});
  succeed('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\' \'http://www.w3.org/TR/REC-html40/strict.dtd\'>',
          { name: 'html',
            publicId: '-//W3C//DTD HTML 4.0//EN',
            systemId: 'http://www.w3.org/TR/REC-html40/strict.dtd'});
  succeed('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\'\t\'http://www.w3.org/TR/REC-html40/strict.dtd\'   >',
          { name: 'html',
            publicId: '-//W3C//DTD HTML 4.0//EN',
            systemId: 'http://www.w3.org/TR/REC-html40/strict.dtd'});
  fatal('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\' \'http://www.w3.org/TR/REC-html40/strict.dtd\'');
  fatal('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\' \'http://www.w3.org/TR/REC-html40/strict.dtd\'');
  fatal('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\' \'http://www.w3.org/TR/REC-html40/strict.dtd');
  fatal('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\' \'');
  fatal('<!DOCTYPE html public \'-//W3C//DTD HTML 4.0//EN\' ');
  fatal('<!DOCTYPE html public \'- ');
  fatal('<!DOCTYPE html public>');
  fatal('<!DOCTYPE html public "-//W3C//DTD HTML 4.0//EN""http://www.w3.org/TR/REC-html40/strict.dtd">');
});

Tinytest.add("html-tools - tokenize", function (test) {

  var fatal = function (input, messageContains) {
    var error;
    try {
      tokenize(input);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    if (messageContains)
      test.isTrue(error.message.indexOf(messageContains) >= 0, error.message);
  };


  test.equal(tokenize(''), []);
  test.equal(tokenize('abc'), [{t: 'Chars', v: 'abc'}]);
  test.equal(tokenize('&'), [{t: 'Chars', v: '&'}]);
  test.equal(tokenize('&amp;'), [{t: 'CharRef', v: '&amp;', cp: [38]}]);
  test.equal(tokenize('ok&#32;fine'),
             [{t: 'Chars', v: 'ok'},
              {t: 'CharRef', v: '&#32;', cp: [32]},
              {t: 'Chars', v: 'fine'}]);

  test.equal(tokenize('a<!--b-->c'),
             [{t: 'Chars',
               v: 'a'},
              {t: 'Comment',
               v: 'b'},
              {t: 'Chars',
               v: 'c'}]);

  test.equal(tokenize('<a>'), [{t: 'Tag', n: 'a'}]);

  fatal('<');
  fatal('<x');
  fatal('<x ');
  fatal('<x a');
  fatal('<x a ');
  fatal('<x a =');
  fatal('<x a = ');
  fatal('<x a = b');
  fatal('<x a = "b');
  fatal('<x a = \'b');
  fatal('<x a = b ');
  fatal('<x a = b /');
  test.equal(tokenize('<x a = b />'),
             [{t: 'Tag', n: 'x',
               attrs: { a: [{t: 'Chars', v: 'b'}] },
               isSelfClosing: true}]);

  test.equal(tokenize('<a>X</a>'),
             [{t: 'Tag', n: 'a'},
              {t: 'Chars', v: 'X'},
              {t: 'Tag', n: 'a', isEnd: true}]);

  fatal('<x a a>'); // duplicate attribute value
  test.equal(tokenize('<a b  >'),
             [{t: 'Tag', n: 'a', attrs: { b: [] }}]);
  fatal('< a>');
  fatal('< /a>');
  fatal('</ a>');

  // Slash does not end an unquoted attribute, interestingly
  test.equal(tokenize('<a b=/>'),
             [{t: 'Tag', n: 'a', attrs: { b: [{t: 'Chars', v: '/'}] }}]);

  test.equal(tokenize('<a b="c" d=e f=\'g\' h \t>'),
             [{t: 'Tag', n: 'a',
               attrs: { b: [{t: 'Chars', v: 'c'}],
                        d: [{t: 'Chars', v: 'e'}],
                        f: [{t: 'Chars', v: 'g'}],
                        h: [] }}]);

  fatal('</a b="c" d=e f=\'g\' h \t\u0000>');
  fatal('</a b="c" d=ef=\'g\' h \t>');
  fatal('</a b="c"d=e f=\'g\' h \t>');

  test.equal(tokenize('<a/>'), [{t: 'Tag', n: 'a', isSelfClosing: true}]);

  fatal('<a/ >');
  fatal('<a/b>');
  fatal('<a b=c`>');
  fatal('<a b=c<>');

  test.equal(tokenize('<a# b0="c@" d1=e2 f#=\'g  \' h \t>'),
             [{t: 'Tag', n: 'a#',
               attrs: { b0: [{t: 'Chars', v: 'c@'}],
                        d1: [{t: 'Chars', v: 'e2'}],
                        'f#': [{t: 'Chars', v: 'g  '}],
                        h: [] }}]);

  test.equal(tokenize('<div class=""></div>'),
             [{t: 'Tag', n: 'div', attrs: { 'class': [] }},
              {t: 'Tag', n: 'div', isEnd: true}]);

  test.equal(tokenize('<div class="&">'),
             [{t: 'Tag', n: 'div', attrs: { 'class': [{t: 'Chars', v: '&'}] }}]);
  test.equal(tokenize('<div class=&>'),
             [{t: 'Tag', n: 'div', attrs: { 'class': [{t: 'Chars', v: '&'}] }}]);
  test.equal(tokenize('<div class=&amp;>'),
             [{t: 'Tag', n: 'div', attrs: { 'class': [{t: 'CharRef', v: '&amp;', cp: [38]}] }}]);

  test.equal(tokenize('<div class=aa&&zopf;&acE;&bb>'),
             [{t: 'Tag', n: 'div', attrs: { 'class': [
               {t: 'Chars', v: 'aa&'},
               {t: 'CharRef', v: '&zopf;', cp: [120171]},
               {t: 'CharRef', v: '&acE;', cp: [8766, 819]},
               {t: 'Chars', v: '&bb'}
             ] }}]);

  test.equal(tokenize('<div class="aa &&zopf;&acE;& bb">'),
             [{t: 'Tag', n: 'div', attrs: { 'class': [
               {t: 'Chars', v: 'aa &'},
               {t: 'CharRef', v: '&zopf;', cp: [120171]},
               {t: 'CharRef', v: '&acE;', cp: [8766, 819]},
               {t: 'Chars', v: '& bb'}
             ] }}]);

  test.equal(tokenize('<a b="\'`<>&">'),
             [{t: 'Tag', n: 'a', attrs: { b: [{t: 'Chars', v: '\'`<>&'}] }}]);
  test.equal(tokenize('<a b=\'"`<>&\'>'),
             [{t: 'Tag', n: 'a', attrs: { b: [{t: 'Chars', v: '"`<>&'}] }}]);

  fatal('&gt');
  fatal('&gtc');
  test.equal(tokenize('<a b=&gtc>'),
             [{t: 'Tag', n: 'a', attrs: { b: [{t: 'Chars', v: '&gtc' }] }}]);
  test.equal(tokenize('<a b="&gtc">'),
             [{t: 'Tag', n: 'a', attrs: { b: [{t: 'Chars', v: '&gtc' }] }}]);
  fatal('<a b=&gt>');
  fatal('<a b="&gt">');
  fatal('<a b="&gt=">');

  fatal('<!');
  fatal('<!x>');

  fatal('<a{{b}}>');
  fatal('<{{a}}>');
  fatal('</a b=c>'); // end tag can't have attributes
  fatal('</a/>'); // end tag can't be self-closing
  fatal('</a  />');
});
