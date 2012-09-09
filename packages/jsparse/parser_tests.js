

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

// The "tree string" format is a simple format for representing syntax trees.
//
// For example, the parse of `x++;` is written as:
// "program(expressionStmnt(postfix(identifier(x) ++) ;))"
//
// A Node is written as "name(item1 item2 item3)", with additional whitespace
// allowed anywhere between the name, parentheses, and items.
//
// Tokens don't need to be escaped unless they contain '(', ')', whitespace, or
// backticks.  If they do, they can be written enclosed in backticks.  To escape
// a backtick within backticks, double it.
//
// `stringifyNode` generates "canonical" tree strings, which have no extra escaping
// or whitespace, just one space between items in a Node.

var parseTreeString = function (str) {
  var results = [];
  var ptrStack = [];
  var ptr = results;
  _.each(str.match(/\(|\)|`([^`]||``)*`|`|[^\s()`]+/g), function (txt) {
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
      ptr.push(txt.slice(1, -1).replace(/``/g, '`'));
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
var stringifyNode = function (obj) {
  if (obj.text)
    obj = obj.text;
  if (typeof obj === "string") {
    if (/[\s()`]/.test(obj))
      return '`' + obj.replace(/`/g, '``') + '`';
    else
      return obj;
  } else {
    return (stringifyNode(obj[0]) + '(' +
            _.map(obj.slice(1), stringifyNode).join(' ') +
            ')');
  }
};

var parseToTreeString = function (code) {
  var lexer = new Lexer(code);
  var tokenizer = new Tokenizer(code);
  var tree = parse(tokenizer);
  return stringifyNode(tree);
};

var makeTester = function (test) {
  return {
    // Parse code and make sure it matches expectedTreeString.
    goodParse: function (code, expectedTreeString) {
      var expectedTree = parseTreeString(expectedTreeString);

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
      var actualTree = parse(tokenizer);

      var nextTokenIndex = 0;
      var check = function (part) {
        if (_.isArray(part) && part.length) {
          // This is a NODE (non-terminal).  Make sure it actually is.
          if (! (part[0] && typeof part[0] === "string" &&
                 allNodeNamesSet[part[0]] === true))
            test.fail("Not a node name: " + part[0]);
          _.each(part.slice(1), check);
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
        } else {
          test.fail("Unknown tree part: " + part);
        }
      };

      check(actualTree);
      if (nextTokenIndex !== allTokensInOrder.length)
        test.fail("Too few tokens: " + nextTokenIndex);

      test.equal(stringifyNode(actualTree),
                 stringifyNode(expectedTree), code);
    },
    // Takes code with part of it surrounding with backticks.
    // Removes the two backtick characters, tries to parse the code,
    // and then asserts that there was a tokenization-level error,
    // with the part that was between the backticks called out as
    // the bad token.
    //
    // For example, the test "123`@`" will try to parse "123@" and
    // assert that a tokenization error occurred at '@'.
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
    // Takes code with a backtick-quoted string embedded in it.
    // Removes the backticks and their contents, tries to parse the code,
    // and then asserts that there was a parse error at the location
    // where the backtick-quoted string was embedded.  The embedded
    // string must match whatever the error message says was "expected".
    //
    // For example, the test "{`statement`" will try to parse the code
    // "{" and then assert that an error occured at the end of the string
    // saying "Expected statement".  The test "1 `semicolon`2" will try
    // to parse "1 2" and assert that the error "Expected semicolon"
    // appeared after the space and before the 2.
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

Tinytest.add("jsparse - syntax forms", function (test) {
  var tester = makeTester(test);
  var trials = [
    ['1',
     'program(expressionStmnt(number(1) ;()))'],
    ['1;;;;2',
     'program(expressionStmnt(number(1) ;) emptyStmnt(;) emptyStmnt(;) emptyStmnt(;) ' +
     'expressionStmnt(number(2) ;()))'],
    ['{}',
     'program(blockStmnt({ }))'],
    ['{null}',
     'program(blockStmnt({ expressionStmnt(null(null) ;()) }))'],
    ['{\nfoo()\nbar();\n}',
     'program(blockStmnt({ expressionStmnt(call(identifier(foo) `(` `)`) ;()) ' +
     'expressionStmnt(call(identifier(bar) `(` `)`) ;) }))'],
    ['{{{}}}',
     'program(blockStmnt({ blockStmnt({ blockStmnt({ }) }) }))'],
    ['var x = y, z,\n  a = b = c;',
     'program(varStmnt(var varDecl(x = identifier(y)) , varDecl(z) , varDecl(a = ' +
     'assignment(identifier(b) = identifier(c))) ;))'],
    ['if (x === y);',
     'program(ifStmnt(if `(` binary(identifier(x) === identifier(y)) `)` emptyStmnt(;)))'],
    ['if (z) return',
     'program(ifStmnt(if `(` identifier(z) `)` returnStmnt(return nil() ;())))'],
    ['if (a) b; else c',
     'program(ifStmnt(if `(` identifier(a) `)` expressionStmnt(identifier(b) ;) else ' +
     'expressionStmnt(identifier(c) ;())))'],
    ['if (n === 1) { foo(); } else if (n === 2) { bar(); } else { baz(); }',
     'program(ifStmnt(if `(` binary(identifier(n) === number(1)) `)` blockStmnt(' +
     '{ expressionStmnt(call(identifier(foo) `(` `)`) ;) }) else ifStmnt(' +
     'if `(` binary(identifier(n) === number(2)) `)` blockStmnt(' +
     '{ expressionStmnt(call(identifier(bar) `(` `)`) ;) }) else blockStmnt(' +
     '{ expressionStmnt(call(identifier(baz) `(` `)`) ;) }))))'],
    ['while (false);',
     'program(whileStmnt(while `(` boolean(false) `)` emptyStmnt(;)))'],
    ['while (/foo/.test(bar.baz)) {\n  bar = bar.baz;\n}',
     'program(whileStmnt(while `(` call(dot(regex(/foo/) . test) `(` ' +
     'dot(identifier(bar) . baz) `)`) `)` blockStmnt({ expressionStmnt(' +
     'assignment(identifier(bar) = dot(identifier(bar) . baz)) ;) })))'],
    ['while (false) while (false);',
     'program(whileStmnt(while `(` boolean(false) `)` ' +
     'whileStmnt(while `(` boolean (false) `)` emptyStmnt(;))))'],
    ['do a; while (b);',
     'program(doStmnt(do expressionStmnt(identifier(a) ;) while `(` identifier(b) `)` ;))'],
    ['do { x-- } while (x);',
     'program(doStmnt(do blockStmnt({ expressionStmnt(postfix(identifier(x) --) ;()) }) ' +
     'while `(` identifier(x) `)` ;))'],
    ['do a\n while (b)\n x++',
     'program(doStmnt(do expressionStmnt(identifier(a) ;()) while `(` identifier(b) `)` ;()) ' +
     'expressionStmnt(postfix(identifier(x) ++) ;()))'],
    ["for(;;);",
     "program(forStmnt(for `(` forSpec(nil() ; nil() ; nil()) `)` emptyStmnt(;)))"],
    ["for(x in y);",
     "program(forStmnt(for `(` forInSpec(identifier(x) in identifier(y)) `)` emptyStmnt(;)))"],
    ["for(var x in y);",
     "program(forStmnt(for `(` forVarInSpec(var varDecl(x) in identifier(y)) `)` emptyStmnt(;)))"],
    ["for(var x;;);",
     "program(forStmnt(for `(` forVarSpec(var varDecl(x) ; nil() ; nil()) `)` emptyStmnt(;)))"],
    ["for(var i=0;i<N;i++) {}",
     "program(forStmnt(for `(` forVarSpec(var varDecl(i = number(0)) ; " +
     "binary(identifier(i) < identifier(N)) ; postfix(identifier(i) ++)) `)` blockStmnt({ })))"],
    ["for (var x=3 in y);",
     "program(forStmnt(for `(` forVarInSpec(var varDecl(x = number(3)) in identifier(y)) `)` " +
     "emptyStmnt(;)))"],
    ["for (x.foo in y);",
     "program(forStmnt(for `(` forInSpec(dot(identifier(x) . foo) in identifier(y)) `)` emptyStmnt(;)))"],
    ["return",
     "program(returnStmnt(return nil() ;()))"],
    ["return;",
     "program(returnStmnt(return nil() ;))"],
    ["return null",
     "program(returnStmnt(return null(null) ;()))"],
    ["return null;",
     "program(returnStmnt(return null(null) ;))"],
    ["return\n1+1",
     "program(returnStmnt(return nil() ;()) expressionStmnt(binary(number(1) + number(1)) ;()))"],
    ["return 1\n  +1",
     "program(returnStmnt(return binary(number(1) + number(1)) ;()))"],
    ["continue",
     "program(continueStmnt(continue nil() ;()))"],
    ["continue foo",
     "program(continueStmnt(continue foo ;()))"],
    ["continue foo;",
     "program(continueStmnt(continue foo ;))"],
    ["continue\n  foo;",
     "program(continueStmnt(continue nil() ;()) expressionStmnt(identifier(foo) ;))"],
    ["break",
     "program(breakStmnt(break nil() ;()))"],
    ["break foo",
     "program(breakStmnt(break foo ;()))"],
    ["break foo;",
     "program(breakStmnt(break foo ;))"],
    ["break\n  foo;",
     "program(breakStmnt(break nil() ;()) expressionStmnt(identifier(foo) ;))"]
    // throwStmnt, ...
  ];
  _.each(trials, function (tr) {
    tester.goodParse(tr[0], tr[1]);
  });
});

// Generating a trial:
//(function (s) { return JSON.stringify([s, parseToTreeString(s)]); })('...')

Tinytest.add("jsparse - bad parses", function (test) {
  var tester = makeTester(test);
  var trials = [
    '{`statement`',
    'if (`expression`)',
    'if `(`else',
    'var`varDecl`;',
    'while (`expression`);',
    'while`(`;',
    'do a `semicolon`while b;',
    'do a\n while `(`b;',
    '1 `semicolon`2',
    'for (`forSpec`);',
    'for (1\n`semicolon`2\n3);',
    'continue `semicolon`1+1;',
    'break `semicolon`1+1;'
  ];
  _.each(trials, function (tr) {
    tester.badParse(tr);
  });
});