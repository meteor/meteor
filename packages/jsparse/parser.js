///// JAVASCRIPT PARSER

// XXX unit tests

// What we don't have from ECMA-262 5.1:
//  - object literal trailing comma
//  - object literal get/set

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
                  unpack(opt(list(token(',')))),
                  unpack(
                    opt(
                      list(
                        describe(
                          'expression',
                          or(assignmentExpressionPtr,
                             // count a peeked-at ']' as an expression
                             // to support elisions at end, e.g.
                             // `[1,2,3,,,,,,]`.  Because it's unpacked,
                             // the look-ahead won't show up in the
                             // parse tree.
                             unpack(lookAheadToken(']')))),
                        // list seperator is one or more commas
                        // to support elision
                        unpack(list(token(',')))),
                      lookAheadToken(']'))),
                  token(']')));

  var propertyName = describe('propertyName', or(
    named('idPropName', tokenClass('IDENTIFIER')),
    named('numPropName', tokenClass('NUMBER')),
    named('strPropName', tokenClass('STRING'))));
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
                or(tokenClass('IDENTIFIER'),
                   revalue(lookAheadToken('('), named('nil', [])))),
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
      // if we have 'new' keywords, we are committed and must
      // match an expression or error.
      var result = runMaybeRequired(news.length, primaryOrFunctionExpression,
                                    t, news[news.length - 1]);
      if (! result)
        return null;

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
      // if we have unaries, we are committed and
      // have to match an expression or error.
      var result = runMaybeRequired(unaries.length, postfixExpression,
                                    t, unaries[unaries.length - 1]);
      if (! result)
        return null;

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

  var assignOp = token('= *= /= %= += -= <<= >>= >>>= &= ^= |=');

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
          while (r.lhs && (op = assignOp(t)))
            parts.push(op,
                       runRequired(conditionalExpressionFunc(noIn), t, op));

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
           }), named(';', []))));

  var expressionStatement = named(
    'expressionStmnt',
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
      // For better error messages, for example in `1+1:`,
      // if there is a colon at the end of the expression,
      // fail now and say "Expected semicolon" instead of failing
      // later saying "Expected statement" at the colon.
      runRequired(noColon, t);
      return exprStmnt;
    }

    var rest = labelColonAndStatement(t);
    if (! rest)
      return exprStmnt;

    return named('labelStmnt',
                 [expr[1]].concat(rest));
  };

  var emptyStatement = named('emptyStmnt', token(';')); // not maybeSemicolon

  var blockStatement = named('blockStmnt', seq(
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
    'varStmnt',
    seq(token('var'), unpack(list(varDecl, token(','))),
        maybeSemicolon));

  // A paren that may be followed by a statement
  // beginning with a regex literal.
  var closeParenBeforeStatement = preSlashToken(')', false);

  var ifStatement = named(
    'ifStmnt',
    seq(token('if'), token('('), expression,
        closeParenBeforeStatement, statementPtr,
        unpack(opt(seq(token('else'), statementPtr)))));

  var secondThirdClauses = describe(
    'semicolon',
    lookAhead(lookAheadToken(';'),
              seq(
                token(';'),
                opt(expressionPtr, revalue(lookAheadToken(';'), named('nil', []))),
                token(';'),
                opt(expressionPtr, revalue(lookAheadToken(')'), named('nil', []))))));
  var inExpr = seq(token('in'), expression);
  var inExprExpectingSemi = describe('semicolon',
                                     seq(token('in'), expression));
  var forSpec = revalue(named(
    'forSpec',
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
       seq(revalue(lookAheadToken(';'), named('nil', [])), unpack(secondThirdClauses)),
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
           rest = runRequired(inExprExpectingSemi, t);
         }

         return [firstExpr].concat(rest);
       })),
                           function (clauses) {
                             // There are four kinds of for-loop, and we call the
                             // part between the parens one of forSpec, forVarSpec,
                             // forInSpec, and forVarInSpec.  Having parsed it
                             // already, we rewrite the node name based on how
                             // many items came out.  forIn and forVarIn always
                             // have 3 and 4 items respectively.  for has 5
                             // (the optional expressions are present as nils).
                             // forVar has 6 or more, because `for(var x;;);`
                             // produces [`var` `x` `;` nil `;` nil].
                             if (! clauses)
                               return null;
                             if (clauses.length === 4)
                               clauses[0] = 'forInSpec';
                             else if (clauses.length === 5)
                               clauses[0] = 'forVarInSpec';
                             else if (clauses.length >= 7)
                               clauses[0] = 'forVarSpec';
                             return clauses;
                           });

  var iterationStatement = or(
    named('doStmnt', seq(token('do'), statementPtr, token('while'),
                         token('('), expression, token(')'),
                         maybeSemicolon)),
    named('whileStmnt', seq(token('while'), token('('), expression,
                            closeParenBeforeStatement, statementPtr)),
    // semicolons must be real, not maybeSemicolons
    named('forStmnt', seq(
      token('for'), token('('), forSpec, closeParenBeforeStatement,
      statementPtr)));

  var returnStatement = named(
    'returnStmnt',
    seq(token('return'), or(
      lookAhead(noLineTerminatorHere, expression), constant(named('nil', []))),
        maybeSemicolon));
  var continueStatement = named(
    'continueStmnt',
    seq(token('continue'), or(
      lookAhead(noLineTerminatorHere, tokenClass('IDENTIFIER')), constant(named('nil', []))),
        maybeSemicolon));
  var breakStatement = named(
    'breakStmnt',
    seq(token('break'), or(
      lookAhead(noLineTerminatorHere, tokenClass('IDENTIFIER')), constant(named('nil', []))),
        maybeSemicolon));
  var throwStatement = named(
    'throwStmnt',
    seq(token('throw'),
        lookAhead(noLineTerminatorHere, expression),
        maybeSemicolon));

  var withStatement = named(
    'withStmnt',
    seq(token('with'), token('('), expression, closeParenBeforeStatement,
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
    'switchStmnt',
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
                or(named(
                  'catch',
                  seq(token('catch'), token('('), tokenClass('IDENTIFIER'),
                      token(')'), blockStatement)),
                   constant(named('nil', []))),
                or(named(
                  'finally',
                  seq(token('finally'), blockStatement)),
                   constant(named('nil', []))))));
  var tryStatement = named(
    'tryStmnt',
    seq(token('try'), blockStatement, unpack(catchFinally)));
  var debuggerStatement = named(
    'debuggerStmnt', seq(token('debugger'), maybeSemicolon));

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
                                             // eat the ending "EOF" so that
                                             // our position is updated
                                             t.consume();
                                             return unpack([]);
                                           }))));

  return program(tokenizer);
};
