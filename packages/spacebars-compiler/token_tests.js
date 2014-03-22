Tinytest.add("spacebars - token parsers", function (test) {

  var run = function (func, input, expected) {
    var scanner = new HTMLTools.Scanner('z' + input);
    // make sure the parse function respects `scanner.pos`
    scanner.pos = 1;
    var result = func(scanner);
    if (expected === null) {
      test.equal(scanner.pos, 1);
      test.equal(result, null);
    } else {
      test.isTrue(scanner.isEOF());
      test.equal(result, expected);
    }
  };

  var runValue = function (func, input, expectedValue) {
    var expected;
    if (expectedValue === null)
      expected = null;
    else
      expected = { text: input, value: expectedValue };
    run(func, input, expected);
  };

  var parseNumber = Spacebars._$.parseNumber;
  var parseIdentifierName = Spacebars._$.parseIdentifierName;
  var parseStringLiteral = Spacebars._$.parseStringLiteral;

  runValue(parseNumber, "0", 0);
  runValue(parseNumber, "-0", 0);
  runValue(parseNumber, "-", null);
  runValue(parseNumber, ".a", null);
  runValue(parseNumber, ".1", 0.1);
  runValue(parseNumber, "1.", 1);
  runValue(parseNumber, "1.1", 1.1);
  runValue(parseNumber, "0x", null);
  runValue(parseNumber, "0xa", 10);
  runValue(parseNumber, "-0xa", -10);
  runValue(parseNumber, "1e+1", 10);

  run(parseIdentifierName, "a", "a");
  run(parseIdentifierName, "true", "true");
  run(parseIdentifierName, "null", "null");
  run(parseIdentifierName, "if", "if");
  run(parseIdentifierName, "1", null);
  run(parseIdentifierName, "1a", null);
  run(parseIdentifierName, "+a", null);
  run(parseIdentifierName, "a1", "a1");
  run(parseIdentifierName, "a1a", "a1a");
  run(parseIdentifierName, "_a8f_f8d88_", "_a8f_f8d88_");

  runValue(parseStringLiteral, '"a"', 'a');
  runValue(parseStringLiteral, '"\'"', "'");
  runValue(parseStringLiteral, '\'"\'', '"');
  runValue(parseStringLiteral, '"a\\\nb"', 'ab'); // line continuation
  runValue(parseStringLiteral, '"a\u0062c"', 'abc');
  // Note: IE 8 doesn't correctly parse '\v' in JavaScript.
  runValue(parseStringLiteral, '"\\0\\b\\f\\n\\r\\t\\v"', '\0\b\f\n\r\t\u000b');
  runValue(parseStringLiteral, '"\\x41"', 'A');
  runValue(parseStringLiteral, '"\\\\"', '\\');
  runValue(parseStringLiteral, '"\\\""', '\"');
  runValue(parseStringLiteral, '"\\\'"', '\'');
  runValue(parseStringLiteral, "'\\\\'", '\\');
  runValue(parseStringLiteral, "'\\\"'", '\"');
  runValue(parseStringLiteral, "'\\\''", '\'');
});
