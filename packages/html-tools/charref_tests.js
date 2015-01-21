var Scanner = HTMLTools.Scanner;
var getCharacterReference = HTMLTools.Parse.getCharacterReference;

Tinytest.add("html-tools - entities", function (test) {
  var succeed = function (input, match, codepoints) {
    if (typeof input === 'string')
      input = {input: input};

    // match arg is optional; codepoints is never a string
    if (typeof match !== 'string') {
      codepoints = match;
      match = input.input;
    }

    var scanner = new Scanner(input.input);
    var result = getCharacterReference(scanner, input.inAttribute, input.allowedChar);
    test.isTrue(result);
    test.equal(scanner.pos, match.length);
    test.equal(result, {
      t: 'CharRef',
      v: match,
      cp: _.map(codepoints,
                function (x) { return (typeof x === 'string' ?
                                       x.charCodeAt(0) : x); })
    });
  };

  var ignore = function (input) {
    if (typeof input === 'string')
      input = {input: input};

    var scanner = new Scanner(input.input);
    var result = getCharacterReference(scanner, input.inAttribute, input.allowedChar);
    test.isFalse(result);
    test.equal(scanner.pos, 0);
  };

  var fatal = function (input, messageContains) {
    if (typeof input === 'string')
      input = {input: input};

    var scanner = new Scanner(input.input);
    var error;
    try {
      getCharacterReference(scanner, input.inAttribute, input.allowedChar);
    } catch (e) {
      error = e;
    }
    test.isTrue(error);
    if (error)
      test.isTrue(messageContains && error.message.indexOf(messageContains) >= 0, error.message);
  };

  ignore('a');
  ignore('&');
  ignore('&&');
  ignore('&\t');
  ignore('& ');
  fatal('&#', 'Invalid numerical character reference starting with &#');
  ignore('&a');
  fatal('&a;', 'Invalid character reference: &a;');
  ignore({input: '&"', allowedChar: '"'});
  ignore('&"');

  succeed('&gt;', ['>']);
  fatal('&gt', 'Character reference requires semicolon');
  ignore('&aaa');
  fatal('&gta', 'Character reference requires semicolon');
  ignore({input: '&gta', inAttribute: true});
  fatal({input: '&gt=', inAttribute: true}, 'Character reference requires semicolon: &gt');

  succeed('&gt;;', '&gt;', ['>']);

  fatal('&asdflkj;', 'Invalid character reference: &asdflkj;');
  fatal('&A0asdflkj;', 'Invalid character reference: &A0asdflkj;');
  ignore('&A0asdflkj');

  succeed('&zopf;', [120171]);
  succeed('&acE;', [8766, 819]);

  succeed('&#10;', [10]);
  fatal('&#10', 'Invalid numerical character reference starting with &#');
  fatal('&#xg;', 'Invalid numerical character reference starting with &#');
  fatal('&#;', 'Invalid numerical character reference starting with &#');
  fatal('&#a;', 'Invalid numerical character reference starting with &#');
  fatal('&#a', 'Invalid numerical character reference starting with &#');
  fatal('&#z', 'Invalid numerical character reference starting with &#');
  succeed('&#000000000000010;', [10]);
  fatal('&#0001000000000010;', 'Numerical character reference too large: 1000000000010');
  succeed('&#x00000000000000000000a;', [10]);
  fatal('&#x000100000000000a;', 'Numerical character reference too large: 0x100000000000a');
  succeed('&#010;', [10]);
  succeed('&#xa;', [10]);
  succeed('&#Xa;', [10]);
  succeed('&#XA;', [10]);
  succeed('&#xA;', [10]);

  fatal('&#0;', 'Illegal codepoint in numerical character reference: &#0;');
  fatal('&#x0;', 'Illegal codepoint in numerical character reference: &#x0;');

  fatal('&#xb;', 'Illegal codepoint in numerical character reference: &#xb;');
  succeed('&#xc;', [12]);
  fatal('&#11;', 'Illegal codepoint in numerical character reference: &#11;');
  succeed('&#12;', [12]);

  fatal('&#x10ffff;', 'Illegal codepoint in numerical character reference');
  fatal('&#x10fffe;', 'Illegal codepoint in numerical character reference');
  succeed('&#x10fffd;', [0x10fffd]);

  fatal('&#1114111;', 'Illegal codepoint in numerical character reference');
  fatal('&#1114110;', 'Illegal codepoint in numerical character reference');
  succeed('&#1114109;', [0x10fffd]);

});
