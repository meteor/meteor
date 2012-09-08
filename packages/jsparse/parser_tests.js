

var allNodeNames = [
  ";",
  "array",
  "assignment",
  "binary",
  "blockStmnt",
  "boolean",
  "bracket",
  "breakStmnt",
  "call",
  "case",
  "catch",
  "comma",
  "continueStmnt",
  "debuggerStmnt",
  "default",
  "doStmnt",
  "dot",
  "emptyStmnt",
  "expressionStmnt",
  "finally",
  "forInSpec",
  "forSpec",
  "forStmnt",
  "forVarInSpec",
  "forVarSpec",
  "functionDecl",
  "functionExpr",
  "idPropName",
  "identifier",
  "ifStmnt",
  "labelStmnt",
  "new",
  "newcall",
  "nil",
  "null",
  "numPropName",
  "number",
  "object",
  "parens",
  "postfix",
  "program",
  "prop",
  "regex",
  "returnStmnt",
  "strPropName",
  "string",
  "switchStmnt",
  "ternary",
  "this",
  "throwStmnt",
  "tryStmnt",
  "unary",
  "varDecl",
  "varStmnt",
  "whileStmnt",
  "withStmnt"
];

var allNodeNamesSet = {};
_.each(allNodeNames, function (n) { allNodeNamesSet[n] = true; });


var makeTester = function (test) {
  var parseTestFormat = function (str) {
    var results = [];
    var ptrStack = [];
    var ptr = results;
    _.each(str.match(/\(|\)|`.*?`|`|[^\s()`]+/g), function (txt) {
      switch (txt.charAt(0)) {
      case '(':
        if (! ptr.length || (typeof ptr[ptr.length - 1] !== "string"))
          throw new Error("Nameless node in " + str);
        var newArray = [ptr.pop()];
        ptr.push(newArray);
        ptrStack.push(ptr);
        ptr = newArray;
        break;
      case ')':
        ptr = ptrStack.pop();
        break;
      case '`':
        if (txt.length === 1)
          throw new Error("Mismatched ` in " + str);
        ptr.push(txt.slice(1, -1));
        break;
      default:
        ptr.push(txt);
        break;
      }
      if (results.length > 1)
        throw new Error("Not expecting " + txt + " in " + str);
    });
    if (ptr !== results)
      throw new Error("Mismatched parentheses in " + str);
    return results[0];
  };
  var stringifyTestFormat = function (obj) {
    if (typeof obj === "string") {
      if (obj.charAt(0) === '(' || obj.charAt(0) === ')')
        return '`' + obj + '`';
      else
        return obj;
    } else {
      if (! obj.length)
        return '()';
      else
        return (stringifyTestFormat(obj[0]) + '(' +
                _.map(obj.slice(1), stringifyTestFormat).join(' ') +
                ')');
    }
  };

  return {
    goodParse: function (code, expectedTreeString) {
      var expectedTree = parseTestFormat(expectedTreeString);

      // first use lexer to collect all tokens
      var lexer = new Lexer(code);
      var allTokensInOrder = [];
      while (lexer.next() !== 'EOF') {
        if (lexer.type === 'ERROR')
          test.fail("Lexer error at " + lexer.lastPos);
        if (Lexer.isToken(lexer.type))
          allTokensInOrder.push({ pos: lexer.lastPos, text: lexer.text });
      }
      lexer = new Lexer(code);

      var tokenizer = new Tokenizer(code);
      var tree = parse(tokenizer);

      var nextTokenIndex = 0;
      var informalize = function (part) {
        if (_.isArray(part) && part.length) {
          // This is a NODE (non-terminal).  Make sure it actually is.
          if (! (part[0] && typeof part[0] === "string" &&
                 allNodeNamesSet[part[0]] === true))
            test.fail("Not a node name: " + part[0]);
          return part.slice(0, 1).concat(
            _.map(part.slice(1), informalize));
        } else if (typeof part === 'object' && part.text &&
                   (typeof part.pos === 'number')) {
          // This is a TOKEN (terminal).
          // Make sure we are visiting every token once, in order.
          if (nextTokenIndex >= allTokensInOrder.length)
            test.fail("Too many tokens: " + (nextTokenIndex + 1));
          var referenceToken = allTokensInOrder[nextTokenIndex++];
          test.equal(part.text, referenceToken.text);
          test.equal(part.pos, referenceToken.pos);
          test.equal(code.substring(part.pos,
                                    part.pos + part.text.length), part.text);
          return part.text;
        } else {
          test.fail("Unknown tree part: " + part);
          return [];
        }
      };

      var actualTree = informalize(tree);
      if (nextTokenIndex !== allTokensInOrder.length)
        test.fail("Too few tokens: " + nextTokenIndex);

      test.equal(stringifyTestFormat(actualTree),
                 stringifyTestFormat(expectedTree));
    },
    badToken: function (code) {
      var constructMessage = function (pos, text) {
        return "Bad token at position " + pos + ", text `" + text + "`";
      };
      var pos = code.indexOf('`');
      var text = code.match(/`(.*?)`/)[1];
      code = code.replace(/`/g, '');

      var parsed = false;
      var error = null;
      try {
        var lexer = new Lexer(code);
        var tokenizer = new Tokenizer(code);
        var tree = parse(tokenizer);
        parsed = true;
      } catch (e) {
        error = e;
      }
      test.isFalse(parsed);
      test.isTrue(error);
      test.equal(error.message, constructMessage(pos, text));
    },
    badParse: function (code) {
      var constructMessage = function (whatExpected, pos, found, after) {
        return "Expected " + whatExpected + " after `" + after +
          "` at position " + pos + ", found " +
          (found ? "`" + found + "`" : "EOF");
      };
      var pos = code.indexOf('`');
      var whatExpected = code.match(/`(.*?)`/)[1];
      code = code.replace(/`.*?`/g, '');

      var parsed = false;
      var error = null;
      try {
        var lexer = new Lexer(code);
        var tokenizer = new Tokenizer(code);
        var tree = parse(tokenizer);
        parsed = true;
      } catch (e) {
        error = e;
      }
      test.isFalse(parsed);
      test.isTrue(error);
      var after = tokenizer.text;
      var found = tokenizer.peekText;
      test.equal(error.message, constructMessage(whatExpected, pos, found, after));
    }
  };
};


Tinytest.add("jsparse - basics", function (test) {
  var tester = makeTester(test);
  tester.goodParse('1', "program(expressionStmnt(number(1) ;()))");
  tester.goodParse('1 + 1', "program(expressionStmnt(binary(number(1) + number(1)) ;()))");
  tester.goodParse('1*2+3*4', "program(expressionStmnt(binary(binary(number(1) * number(2)) + " +
                "binary(number(3) * number(4))) ;()))");
  tester.goodParse('1 + 1;', "program(expressionStmnt(binary(number(1) + number(1)) ;))");
  tester.goodParse('1 + 1;;', "program(expressionStmnt(binary(number(1) + number(1)) ;) emptyStmnt(;))");
  tester.goodParse('', "program()");
  tester.goodParse('\n', "program()");
  tester.goodParse(';;;\n\n;\n', "program(emptyStmnt(;) emptyStmnt(;) emptyStmnt(;) emptyStmnt(;))");
  tester.goodParse('foo', "program(expressionStmnt(identifier(foo) ;()))");
  tester.goodParse('foo();', "program(expressionStmnt(call(identifier(foo) `(` `)`) ;))");
  tester.goodParse('var x = 3', "program(varStmnt(var varDecl(x = number(3)) ;()))");
  tester.goodParse('++x;', "program(expressionStmnt(unary(++ identifier(x)) ;))");
  tester.goodParse('x++;', "program(expressionStmnt(postfix(identifier(x) ++) ;))");
  tester.goodParse(
    'throw new Error',
    "program(throwStmnt(throw new(new identifier(Error)) ;()))");
  tester.goodParse(
    'var x = function () { return 123; };',
    'program(varStmnt(var varDecl(x = functionExpr(function nil() `(` `)` ' +
      '{ returnStmnt(return number(123) ;) })) ;))');

  tester.badParse("var x = `expression`");
  tester.badParse("1 `semicolon`1");
  tester.badParse("1+1`semicolon`:");
});

Tinytest.add("jsparse - tokenization errors", function (test) {
  var tester = makeTester(test);
  tester.badToken("123`@`");
  tester.badToken("thisIsATestOf = `'unterminated `\n strings'");
});