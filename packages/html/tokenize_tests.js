var Scanner = HTML._$.Scanner;
var getComment = HTML._$.getComment;
var getDoctype = HTML._$.getDoctype;

Tinytest.add("html - comments", function (test) {
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

Tinytest.add("html - doctype", function (test) {
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