
// NOTES

// push/pop lexer position
// need to support [no LineTerminator here]
// need to be able to look back at original whitespace later,
//   find all the whitespace before a token
// "token" means anything but whitespace, newline, or comment
// multiline comments produce virtual newlines
// maybe conform to the spec's token input to the syntactic grammar?

// XXX track line/col position, for errors and maybe token info
// XXX implement `required(parser, prev)`

var isArray = function (obj) {
  return obj && (typeof obj === 'object') && (typeof obj.length === 'number');
};

Tokenizer = function (codeOrLexer) {
  // XXX rethink codeOrLexer later
  this.lexer = (codeOrLexer instanceof Lexer ? codeOrLexer :
                new Lexer(codeOrLexer));
  this.peekType = null;
  this.peekText = null;
  this.tokenType = null;
  this.tokenText = null;
  this.lastPos = 0;
  this.pos = 0;
  this.isLineTerminatorHere = false;

  // load peekType and peekText
  this.consume();
};

_.extend(Tokenizer.prototype, {
  // consumes the token (peekType, peekText) and moves
  // it into (type, text), loading the next token
  // into (peekType, peekText).  A token is a lexeme
  // besides WHITESPACE, COMMENT, and NEWLINE.
  consume: function () {
    var self = this;
    var lexer = self.lexer;
    self.type = self.peekType;
    self.text = self.peekText;
    self.lastPos = self.pos;
    self.isLineTerminatorHere = false;
    do {
      lexer.next();
      if (lexer.type === "ERROR")
        throw new Error("Bad token at position " + lexer.lastPos +
                        ", text `" + lexer.text + "`");
      else if (lexer.type === "NEWLINE")
        self.isLineTerminatorHere = true;
      else if (lexer.type === "COMMENT" && ! /^.*$/.test(lexer.text))
        // multiline comments containing line terminators count
        // as line terminators.
        self.isLineTerminatorHere = true;
    } while (lexer.type !== "EOF" && ! Lexer.isToken(lexer.type));
    self.peekType = lexer.type;
    self.peekText = lexer.text;
    self.pos = lexer.lastPos;
  }
});

// A parser that consume()s has to succeed.
// Similarly, a parser that fails can't have consumed.

// mutates the parser; don't describe an existing parser.
var describe = function (description, parser) {
  parser.description = description;
  return parser;
};

// Call this as `throw parseError(...)`.
// `expected` is a parser, `after` is a string.
var parseError = function (t, expected, after) {
  var str = (expected.description ? "Expected " + expected.description :
             // all parsers that might error should have descriptions,
             // but just in case:
             "Unexpected token");
  if (after)
    str += " after " + (after.text ? "`" + after.text + "`" : after);
  var pos = t.pos;
  str += " at position " + pos;
  str += ", found " + (t.peekText ? "`" + t.peekText + "`" : "EOF");
  var e = new Error(str);
  return e;
};

///// TERMINAL PARSER CONSTRUCTORS

var _tokenClassImpl = function (type, text, dontConsume) {
  var textSet = (text ? makeSet(text.split(' ')) : null);
  var description = (text ? text.split(' ').join(', ') : type);
  return describe(
    description,
    function (t) {
      if (t.peekType == type && (!text || textSet[t.peekText])) {
        if (dontConsume)
          return [];
        var ret = {text: t.peekText, pos: t.pos};
        t.consume();
        return ret;
      }
      return null;
    });
};

var _tokenImpl = function (text, dontConsume) {
  if (/\w/.test(text))
    return _tokenClassImpl('KEYWORD', text, dontConsume);
  return _tokenClassImpl('PUNCTUATION', text, dontConsume);
};

var tokenClass = function (type, text) {
  if (type === "ERROR" || type === "EOF")
    throw new Error("Can't create EOF or ERROR tokens, can only look ahead");
  return _tokenClassImpl(type, text);
};

var token = function (text) {
  return _tokenImpl(text);
};

// Like token, but marks tokens that need to defy the lexer's
// heuristic about whether the next '/' is a division or
// starts a regex.
var preSlashToken = function (text, divisionNotRegex) {
  var impl = _tokenImpl(text);
  return describe(impl.description,
                  function (t) {
                    // temporarily set divisionPermitted,
                    // restoring it if we don't match.
                    var oldValue = t.lexer.divisionPermitted;
                    var result;
                    try {
                      t.lexer.divisionPermitted = divisionNotRegex;
                      result = impl(t);
                      return result;
                    } finally {
                      if (! result)
                        t.lexer.divisionPermitted = oldValue;
                    }
                  });
};

// NON-CONSUMING PARSER CONSTRUCTORS

var lookAheadTokenClass = function (type, text) {
  return _tokenClassImpl(type, text, true);
};

var lookAheadToken = function (text) {
  return _tokenImpl(text, true);
};

///// NON-TERMINAL PARSER CONSTRUCTORS

// Combinators that take names must provide descriptions.
// Otherwise, it is up to the call to provide a description.

// Polymorphic in parsers and results; an experiment.
var named = function(name, parserOrResult) {
  return describe(
    name,
    revalue(
      parserOrResult,
      function (value) {
        if (! value)
          return null;

        var result;
        if (isArray(value) && ! value.named)
          // bare array, prepend the name
          result = [name].concat(Array.prototype.slice.call(value));
        else
          // token or named array; construct a new named array
          result = [name, value];

        // don't name the same thing twice
        result.named = true;

        return result;
      }));
};

var or = function (/*parsers*/) {
  var args = arguments;
  return function (t) {
    var result;
    for(var i = 0, N = args.length; i < N; i++) {
      result = args[i](t);
      if (result)
        return result;
    }
    return null;
  };
};

// Parses a left-recursive expression with zero or more occurrences
// of a binary op.  Leaves the term unwrapped if no op.  For example
// (in a hypothetical use case):
// `1` => "1"
// `1+2` => ["binary", "1", "+", "2"]
// `1+2+3` => ["binary", ["binary", "1", "+", "2"], "+", "3"]
//
// opParser can also be an array of op parsers from high to low
// precedence (tightest-binding first)
var binaryLeft = function (termParser, opParser) {
  if (isArray(opParser)) {
    if (opParser.length === 1) {
      // take single opParser out of its array
      opParser = opParser[0];
    } else {
      // pop off last opParser (non-destructively) and replace
      // termParser with a recursive binaryLeft on the remaining
      // ops.
      termParser = binaryLeft(termParser, opParser.slice(0, -1));
      opParser = opParser[opParser.length - 1];
    }
  }

  return describe(
    termParser.description,
    function (t) {
      var result = termParser(t);
      if (! result)
        return null;

      var op;
      while ((op = opParser(t))) {
        result = named('binary', [result, op, termParser(t)]);
        if (! result[result.length - 1])
          throw parseError(t, termParser, result[result.length - 2]);
      }
      return result;
    });
};

// Parses a list of one or more items with a separator, listing the
// items and separators.  (Separator is optional.)  For example:
// `x` => ["x"]
// `x,y` => ["x", ",", "y"]
// `x,y,z` => ["x", ",", "y", ",", "z"]
var list = function (itemParser, sepParser) {
  return describe(
    itemParser.description,
    function (t) {
      var result = [itemParser(t)];
      if (! result[0])
        return null;

      if (sepParser) {
        var sep;
        while ((sep = sepParser(t))) {
          result.push(sep, itemParser(t));
          if (! result[result.length - 1])
            throw parseError(t, itemParser, result[result.length - 2]);
        }
      } else {
        var item;
        while ((item = itemParser(t)))
          result.push(item);
      }
      return result;
    });
};

var seq = function (/*parsers*/) {
  var args = arguments;
  if (! args.length)
    return describe("(empty)",
                    function (t) { return []; });

  var description = args[0].description;
  for (var i = 1; i < args.length; i++)
    description += " " + args[i].description;
  return describe(
    description,
    function (t) {
      var result = [];
      for (var i = 0, N = args.length; i < N; i++) {
        var r = args[i](t);
        if (! r) {
          if (i === 0)
            return null; // not committed on first item
          throw parseError(t, args[i]);
        }
        if (r.unpack) // append array!
          result.push.apply(result, r);
        else
          result.push(r);
      }
      return result;
    });
};

var unpack = function (arrayParser) {
  return revalue(arrayParser, function (v) {
    if (v && isArray(v))
      v.unpack = true;
    return v;
  });
};

// lookAhead parser must never consume
var lookAhead = function (lookAheadParser, nextParser) {
  return describe(
    lookAheadParser.description,
    function (t) {
      if (! lookAheadParser(t))
        return null;
      return nextParser(t);
    });
};
var negLookAhead = function (lookAheadParser, nextParser) {
  if (! nextParser)
    return function (t) {
      return lookAheadParser(t) ? null : [];
    };

  return describe(
    nextParser.description,
    function (t) {
      if (lookAheadParser(t))
        return null;
      return nextParser(t);
    });
};

// parser that looks at nothing and returns result
var constant = function (result) {
  // no description
  return function (t) {
    return result;
  };
};

// afterLookAhead allows the parser to fail rather than
// succeed if would otherwise fail at a position where
// afterLookAhead doesn't match, potentially providing
// a better error message.  For example, the illegal
// object literal `{true:1}` will stop at the `true`
// and say something like "expected property name"
// instead of "expected }".  As another example,
// `for(;var;) {}` will lead to "Expected expression"
// instead of "Expected ;" when the optional expression
// turns out to be an illegal `var`.
var opt = function (parser, afterLookAhead) {
  return describe(parser.description,
                  or(parser, afterLookAhead ? afterLookAhead : seq()));
};

// note: valueTransformFunc gets the tokenizer as a second argument
// if it's called on a parser.  This func is allowed to then
// run more parsers.
var revalue = function (parserOrValue, valueTransformFunc) {
  if (typeof parserOrValue === 'function')
    // it's a parser
    return describe(parserOrValue.description,
                    function (t) {
                      return valueTransformFunc(parserOrValue(t), t);
                    });
  else
    return valueTransformFunc(parserOrValue);
};

var parse = function (tokenizer) {
  var noLineTerminatorHere = describe(
    'noLineTerminator', function (t) {
      return t.isLineTerminatorHere ? null : [];
    });
  // Function that takes one-item arrays to their single item and names other
  // arrays with `name`.  Works on parsers too.
  var nameIfMultipart = function (name, parser) {
    return revalue(
      parser,
      function (parts) {
        if (! parts)
          return null;
        return (parts.length === 1) ?
          parts[0] : named(name, parts);
      });
  };

  // These "pointers" allow grammar circularity, i.e. accessing
  // later parsers from earlier ones.
  var expressionPtrFunc = function (noIn) {
    return describe(
      "expression",
      function (t) {
        return expressionFunc(noIn)(t);
      });
  };
  var expressionPtr = expressionPtrFunc(false);

  var assignmentExpressionPtrFunc = function (noIn) {
    return describe(
      "expression",
      function (t) {
        return assignmentExpressionFunc(noIn)(t);
      });
  };
  var assignmentExpressionPtr = assignmentExpressionPtrFunc(false);

  var functionBodyPtr = describe(
    "functionBody", function (t) {
      return functionBody(t);
    });

  var statementPtr = describe(
    "statement", function (t) {
      return statement(t);
    });

  var arrayLiteral =
        named('array',
              seq(token('['),
                  unpack(opt(list(assignmentExpressionPtr,
                                  token(',')), lookAheadToken(']'))),
                  token(']')));

  var propertyName = describe('propertyName', or(
    named('identifier', tokenClass('IDENTIFIER')),
    named('number', tokenClass('NUMBER')),
    named('string', tokenClass('STRING'))));
  var nameColonValue = describe(
    'name:value',
    named('prop', seq(propertyName, token(':'), assignmentExpressionPtr)));

  var objectLiteral =
        named('object',
              seq(token('{'),
                  unpack(opt(list(nameColonValue,
                                  token(',')), lookAheadToken('}'))),
                  token('}')));

  // not memoized; only call at construction time
  var functionFunc = function (nameRequired) {
    return seq(token('function'),
               (nameRequired ? tokenClass('IDENTIFIER') :
                opt(tokenClass('IDENTIFIER'),
                    lookAheadToken('('))),
               token('('),
               unpack(opt(list(tokenClass('IDENTIFIER'), token(',')),
                          lookAheadToken(')'))),
               token(')'),
               token('{'),
               unpack(functionBodyPtr),
               token('}'));
  };
  var functionExpression = named('functionExpr',
                                 functionFunc(false));

  var primaryOrFunctionExpression =
        describe('expression',
                 or(named('this', token('this')),
                    named('identifier', tokenClass('IDENTIFIER')),
                    named('number', tokenClass('NUMBER')),
                    named('boolean', tokenClass('BOOLEAN')),
                    named('null', tokenClass('NULL')),
                    named('regex', tokenClass('REGEX')),
                    named('string', tokenClass('STRING')),
                    named('parens',
                          seq(token('('), expressionPtr, token(')'))),
                    arrayLiteral,
                    objectLiteral,
                    functionExpression));

  var dotEnding = seq(token('.'), tokenClass('IDENTIFIER'));
  var bracketEnding = seq(token('['), expressionPtr, token(']'));
  var callArgs = seq(token('('),
                      unpack(opt(list(assignmentExpressionPtr,
                                      token(',')), lookAheadToken(')'))),
                      token(')'));

  var newKeyword = token('new');

  // This is a completely equivalent refactor of the spec's production
  // for a LeftHandSideExpression.
  //
  // An lhsExpression is basically an expression that can serve as
  // the left-hand-side of an assignment, though function calls and
  // "new" invocation are included because they have the same
  // precedence.  Actually, the spec technically allows a function
  // call to "return" a valid l-value, as in `foo(bar) = baz`,
  // though no built-in or user-specifiable call has this property
  // (it would have to be defined by a browser or other "host").
  var lhsExpression = describe(
    'expression',
    function (t) {
      // Accumulate all initial "new" keywords, not yet knowing
      // if they have a corresponding argument list later.
      var news = [];
      var n;
      while ((n = newKeyword(t)))
        news.push(n);

      // Read the primaryOrFunctionExpression that will be the "core"
      // of this lhsExpression.  It is preceded by zero or more `new`
      // keywords, and followed by any sequence of (...), [...],
      // and .foo add-ons.
      var result = primaryOrFunctionExpression(t);
      if (! result) {
        if (! news.length)
          return null; // not committed
        else
          throw parseError(t, primaryOrFunctionExpression,
                           news[news.length - 1]);
      }

      // Our plan of attack is to apply each dot, bracket, or call
      // as we come across it.  Whether a call is a `new` call depends
      // on whether there are `new` keywords we haven't used.  If so,
      // we pop one off the stack.
      var done = false;
      while (! done) {
        var r;
        if ((r = dotEnding(t))) {
          result = named('dot', [result].concat(r));
        } else if ((r = bracketEnding(t))) {
          result = named('bracket', [result].concat(r));
        } else if ((r = callArgs(t))) {
          if (news.length)
            result = named('newcall', [news.pop(), result].concat(r));
          else
            result = named('call', [result].concat(r));
        } else {
          done = true;
        }
      }

      // There may be more `new` keywords than calls, which is how
      // paren-less constructions (`new Date`) are parsed.  We've
      // already handled `new foo().bar()`, now handle `new new foo().bar`.
      while (news.length)
        result = named('new', [news.pop(), result]);

      // mark any LeftHandSideExpression, for the benefit of
      // assignmentExpression
      result.lhs = true;

      return result;
    });

  var postfixToken = token('++ --');
  var postfixLookahead = lookAheadToken('++ --');
  var postfixExpression = describe(
    'expression',
    nameIfMultipart(
      'postfix',
      seq(lhsExpression,
          unpack(opt(lookAhead(noLineTerminatorHere,
                               lookAhead(postfixLookahead,
                                         postfixToken)))))));
  var unaryList = opt(list(or(token('delete void typeof'),
                              preSlashToken('++ -- + - ~ !', false))));
  var unaryExpression = describe(
    'expression',
    function (t) {
      var unaries = unaryList(t);
      var result = postfixExpression(t);
      if (! result) {
        if (unaries.length)
          // committed, have to error
          throw parseError(t, postfixExpression, unaries[unaries.length - 1]);
        return null;
      }

      while (unaries.length)
        result = named('unary', [unaries.pop(), result]);
      return result;
    });

  var memoizeBooleanFunc = function (func) {
    var trueResult, falseResult;
    return function (flag) {
      if (flag)
        return trueResult || (trueResult = func(true));
      else
        return falseResult || (falseResult = func(false));
    };
  };

  // actually this is the spec's LogicalORExpression
  var binaryExpressionFunc = memoizeBooleanFunc(
    function (noIn) {
      // high to low precedence
      var binaryOps = [token('* / %'),
                 token('+ -'),
                 token('<< >> >>>'),
                 or(token('< > <= >='),
                    noIn ? token('instanceof') :
                    token('instanceof in')),
                 token('== != === !=='),
                 token('&'),
                 token('^'),
                 token('|'),
                 token('&&'),
                 token('||')];
      return describe(
        'expression',
        binaryLeft(unaryExpression, binaryOps));
    });
  var binaryExpression = binaryExpressionFunc(false);

  var conditionalExpressionFunc = memoizeBooleanFunc(
    function (noIn) {
      return describe(
        'expression',
        nameIfMultipart(
          'ternary',
          seq(binaryExpressionFunc(noIn), unpack(opt(seq(
            token('?'),
            assignmentExpressionPtrFunc(false), token(':'),
            assignmentExpressionPtrFunc(noIn)))))));
    });
  var conditionalExpression = conditionalExpressionFunc(false);

  var assignOp = token('= *= /= %= += -= <<= >>= >>>= &= ^= |= ');

  var assignmentExpressionFunc = memoizeBooleanFunc(
    function (noIn) {
      return describe(
        'expression',
        function (t) {
          var r = conditionalExpressionFunc(noIn)(t);
          if (! r)
            return null;

          // Assignment is right-associative.
          // Plan of attack: make a list of all the parts
          // [expression, op, expression, op, ... expression]
          // and then fold them up at the end.
          var parts = [r];
          var op;
          while (r.lhs && (op = assignOp(t))) {
            r = conditionalExpressionFunc(noIn)(t);
            if (! r)
              throw parseError(t, conditionalExpressionFunc(noIn), r);
            parts.push(op, r);
          }

          var result = parts.pop();
          while (parts.length) {
            op = parts.pop();
            var lhs = parts.pop();
            result = named('assignment', [lhs, op, result]);
          }
          return result;
        });
    });
  var assignmentExpression = assignmentExpressionFunc(false);

  var expressionFunc = memoizeBooleanFunc(
    function (noIn) {
      return describe(
        'expression',
        nameIfMultipart(
          'comma',
          list(assignmentExpressionFunc(noIn), token(','))));
    });
  var expression = expressionFunc(false);

  // STATEMENTS

  var statements = list(statementPtr);

  // implements JavaScript's semicolon "insertion" rules
  var maybeSemicolon = describe(
    'semicolon',
    or(token(';'),
       revalue(
         or(
           lookAheadToken('}'),
           lookAheadTokenClass('EOF'),
           function (t) {
             return t.isLineTerminatorHere ? [] : null;
           }),
         function (v) {
           return v && named(';', []);
         })));


  var expressionStatement = named(
    'expression',
    negLookAhead(
      or(lookAheadToken('{'), lookAheadToken('function')),
      seq(expression,
          describe('semicolon',
                   or(maybeSemicolon,
                      // allow presence of colon to terminate
                      // statement legally, for the benefit of
                      // expressionOrLabelStatement.  Basically assume
                      // an implicit semicolon.  This
                      // is safe because a colon can never legally
                      // follow a semicolon anyway.
                      lookAheadToken(':'))))));

  // it's hard to parse statement labels, as in
  // `foo: x = 1`, because we can't tell from the
  // first token whether we are looking at an expression
  // statement or a label statement.  To work around this,
  // expressionOrLabelStatement parses the expression and
  // then rewrites the result if it is an identifier
  // followed by a colon.
  var labelColonAndStatement = seq(token(':'), statementPtr);
  var noColon = describe(
    'semicolon',
    negLookAhead(lookAheadToken(':')));
  var expressionOrLabelStatement = function (t) {
    var exprStmnt = expressionStatement(t);
    if (! exprStmnt)
      return null;

    var expr = exprStmnt[1];
    var maybeSemi = exprStmnt[2];
    if (expr[0] !== 'identifier' || ! isArray(maybeSemi)) {
      if (! noColon(t))
        // For better error messages, if there is a colon
        // at the end of the expression, fail now and
        // say "Expected semicolon" instead of failing
        // later saying "Expected statement" after the
        // colon.
        throw parseError(t, noColon);
      return exprStmnt;
    }

    var rest = labelColonAndStatement(t);
    if (! rest)
      return exprStmnt;

    return named('label',
                 [expr[1]].concat(rest));
  };

  var emptyStatement = named('empty', token(';')); // not maybeSemicolon

  var blockStatement = named('block', seq(
    token('{'), unpack(opt(statements, lookAheadToken('}'))),
    token('}')));

  var varDeclFunc = memoizeBooleanFunc(function (noIn) {
    return named(
      'varDecl',
      seq(tokenClass('IDENTIFIER'),
          unpack(opt(seq(token('='),
                         assignmentExpressionFunc(noIn))))));
  });
  var varDecl = varDeclFunc(false);

  var variableStatement = named(
    'variables',
    seq(token('var'), unpack(list(varDecl, token(','))),
        maybeSemicolon));

  // A paren that may be followed by a statement
  // beginning with a regex literal.
  var parenBeforeStatement = preSlashToken(')', false);

  var ifStatement = named(
    'if',
    seq(token('if'), token('('), expression,
        parenBeforeStatement, statementPtr,
        unpack(opt(seq(token('else'), statementPtr)))));

  var secondThirdClauses = describe(
    'semicolon',
    lookAhead(lookAheadToken(';'),
              seq(
                token(';'),
                opt(expressionPtr, lookAheadToken(';')),
                token(';'),
                opt(expressionPtr, lookAheadToken(')')))));
  var inExpr = seq(token('in'), expression);
  var inExprExpectingSemi = describe('semicolon',
                                     seq(token('in'), expression));
  var forClauses = named(
    'forClauses',
    or(seq(token('var'),
           varDeclFunc(true),
           describe(
             'commaOrIn',
             or(unpack(inExpr),
                unpack(seq(
                  unpack(opt(
                    seq(token(','),
                        unpack(list(varDeclFunc(true), token(',')))),
                    lookAheadToken(';'))),
                  unpack(secondThirdClauses)))))),
       // get the case where the first clause is empty out of the way.
       // the lookAhead's return value is the empty placeholder for the
       // missing expression.
       seq(lookAheadToken(';'), unpack(secondThirdClauses)),
       // custom parser the non-var case because we have to
       // read the first expression before we know if there's
       // an "in".
       function (t) {
         var firstExpr = expressionFunc(true)(t);
         if (! firstExpr)
           return null;
         var rest = secondThirdClauses(t);
         if (! rest) {
           // we need a left-hand-side expression for a
           // `for (x in y)` loop.
           if (! firstExpr.lhs)
             throw parseError(t, secondThirdClauses);
           // if we don't see 'in' at this point, it's probably
           // a missing semicolon
           rest = inExprExpectingSemi(t);
           if (! rest)
             throw parseError(t, inExprExpectingSemi);
         }

         return [firstExpr].concat(rest);
       }));

  var iterationStatement = or(
    named('do', seq(token('do'), statementPtr, token('while'),
                    token('('), expression, token(')'),
                    maybeSemicolon)),
    named('while', seq(token('while'), token('('), expression,
                       parenBeforeStatement, statementPtr)),
    // semicolons must be real, not maybeSemicolons
    named('for', seq(
      token('for'), token('('), forClauses, parenBeforeStatement,
      statementPtr)));

  var returnStatement = named(
    'return',
    seq(token('return'), opt(
      lookAhead(noLineTerminatorHere, expression)),
        maybeSemicolon));
  var continueStatement = named(
    'continue',
    seq(token('continue'), opt(
      lookAhead(noLineTerminatorHere, tokenClass('IDENTIFIER'))),
        maybeSemicolon));
  var breakStatement = named(
    'break',
    seq(token('break'), opt(
      lookAhead(noLineTerminatorHere, tokenClass('IDENTIFIER'))),
        maybeSemicolon));
  var throwStatement = named(
    'throw',
    seq(token('throw'),
        lookAhead(noLineTerminatorHere, expression),
        maybeSemicolon));

  var withStatement = named(
    'with',
    seq(token('with'), token('('), expression, parenBeforeStatement,
        statementPtr));

  var switchCase = named(
    'case',
    seq(token('case'), expression, token(':'),
        unpack(opt(statements, or(lookAheadToken('}'),
                                  lookAheadToken('case default'))))));
var switchDefault = named(
    'default',
    seq(token('default'), token(':'),
        unpack(opt(statements, or(lookAheadToken('}'),
                                  lookAheadToken('case'))))));

  var switchStatement = named(
    'switch',
    seq(token('switch'), token('('), expression, token(')'),
        token('{'), unpack(opt(list(switchCase),
                               or(lookAheadToken('}'),
                                  lookAheadToken('default')))),
        unpack(opt(seq(switchDefault,
                       unpack(opt(list(switchCase)))))),
        token('}')));

  var catchFinally = describe(
    'catchOrFinally',
    lookAhead(lookAheadToken('catch finally'),
              seq(
                opt(named(
                  'catch',
                  seq(token('catch'), token('('), tokenClass('IDENTIFIER'),
                      token(')'), blockStatement))),
                opt(named(
                  'finally',
                  seq(token('finally'), blockStatement))))));
  var tryStatement = named(
    'try',
    seq(token('try'), blockStatement, unpack(catchFinally)));
  var debuggerStatement = named(
    'debugger', seq(token('debugger'), maybeSemicolon));

  var statement = describe('statement',
                           or(expressionOrLabelStatement,
                              emptyStatement,
                              blockStatement,
                              variableStatement,
                              ifStatement,
                              iterationStatement,
                              returnStatement,
                              continueStatement,
                              breakStatement,
                              withStatement,
                              switchStatement,
                              throwStatement,
                              tryStatement,
                              debuggerStatement));

  // PROGRAM

  var functionDecl = named('functionDecl',
                           functionFunc(true));

  var sourceElement = or(statement, functionDecl);
  var sourceElements = list(sourceElement);

  var functionBody = describe('functionBody',
                              opt(sourceElements,
                                  lookAheadToken('}')));

  var program = named('program',
                      seq(unpack(opt(sourceElements)),
                          // we rely on the fact that opt(sourceElements)
                          // will never fail, and non-first arguments
                          // to seq are required to succeed -- meaning
                          // this parser will never fail without throwing
                          // a parse error.
                          describe('statement',
                                   revalue(lookAheadTokenClass("EOF"),
                                           function (v, t) {
                                             if (! v)
                                               return null;
                                             // eat the last "EOF" so that
                                             // our position is updated
                                             t.consume();
                                             return unpack([]);
                                           }))));

  return program(tokenizer);
};
