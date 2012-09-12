///// JAVASCRIPT PARSER

// What we don't have from ECMA-262 5.1:
//  - object literal trailing comma
//  - object literal get/set

(function () {

var makeSet = function (array) {
  var s = {};
  for (var i = 0, N = array.length; i < N; i++)
    s[array[i]] = true;
  return s;
};


JSParser = function (code) {
  this.lexer = new JSLexer(code);
  this.oldToken = null;
  this.newToken = null;
  this.pos = 0;
  this.isLineTerminatorHere = false;

  this.consumeNewToken();
};

JSParser.prototype.consumeNewToken = function () {
  var self = this;
  var lexer = self.lexer;
  self.oldToken = self.newToken;
  self.isLineTerminatorHere = false;
  var lex;
  do {
    lex = lexer.next();
    if (lex.isError())
      throw new Error("Bad token at position " + lex.startPos() +
                      ", text `" + lex.text() + "`");
    else if (lex.type() === "NEWLINE")
      self.isLineTerminatorHere = true;
    else if (lex.type() === "COMMENT" && ! /^.*$/.test(lex.text()))
      // multiline comments containing line terminators count
      // as line terminators.
      self.isLineTerminatorHere = true;
  } while (! lex.isEOF() && ! lex.isToken());
  self.newToken = lex;
  self.pos = lex.startPos();
};

JSParser.prototype.getParseError = function (expecting, found) {
  var msg = (expecting ? "Expected " + expecting : "Unexpected token");
  if (this.oldToken)
    msg += " after " + this.oldToken;
  var pos = this.pos;
  msg += " at position " + pos;
  msg += ", found " + (found || this.newToken);
  return new Error(msg);
};

JSParser.prototype.getSyntaxTree = function () {
  var NIL = new ParseNode('nil', []);

  var booleanFlaggedParser = function (parserConstructFunc) {
    return {
      false: parserConstructFunc(false),
      true: parserConstructFunc(true)
    };
  };

  // Takes a space-separated list of either punctuation or keyword tokens
  var lookAheadToken = function (tokens) {
    var type = (/\w/.test(tokens) ? 'KEYWORD' : 'PUNCTUATION');
    var textSet = makeSet(tokens.split(' '));
    return expecting(
      tokens.split(' ').join(', '),
      assertion(function (t) {
        return (t.newToken.type() === type && textSet[t.newToken.text()]);
      }));
  };

  var lookAheadTokenType = function (type) {
    return expecting(type, assertion(function (t) {
      return t.newToken.type() === type;
    }));
  };

  // Takes a space-separated list of either punctuation or keyword tokens
  var token = function (tokens) {
    var type = (/\w/.test(tokens) ? 'KEYWORD' : 'PUNCTUATION');
    var textSet = makeSet(tokens.split(' '));
    return new Parser(
      tokens.split(' ').join(', '),
      function (t) {
        if (t.newToken.type() === type && textSet[t.newToken.text()]) {
          t.consumeNewToken();
          return t.oldToken;
        }
        return null;
      });
  };

  var tokenType = function (type) {
    return new Parser(type, function (t) {
      if (t.newToken.type() === type) {
        t.consumeNewToken();
        return t.oldToken;
      }
      return null;
    });
  };

  var noLineTerminatorHere = expecting(
    'noLineTerminator', assertion(function (t) {
      return ! t.isLineTerminatorHere;
    }));

  var nonLHSExpressionNames = makeSet(
    'unary binary postfix ternary assignment comma'.split(' '));
  var isExpressionLHS = function (exprNode) {
    return ! nonLHSExpressionNames[exprNode.name];
  };

  // Like token, but marks tokens that need to defy the lexer's
  // heuristic about whether the next '/' is a division or
  // starts a regex.
  var preSlashToken = function (text, divisionNotRegex) {
    var inner = token(text);
    return new Parser(
      inner.expecting,
      function (t) {
        // temporarily set divisionPermitted,
        // restoring it if we don't match.
        var oldValue = t.lexer.divisionPermitted;
        var result;
        try {
          t.lexer.divisionPermitted = divisionNotRegex;
          result = inner.parse(t);
          return result;
        } finally {
          if (! result)
            t.lexer.divisionPermitted = oldValue;
        }
      });
  };

  // These "pointers" allow grammar circularity, i.e. accessing
  // later parsers from earlier ones.
  var expressionMaybeNoInPtr = booleanFlaggedParser(
    function (noIn) {
      return new Parser(
        "expression",
        function (t) {
          return expressionMaybeNoIn[noIn].parse(t);
        });
    });
  var expressionPtr = expressionMaybeNoInPtr[false];

  var assignmentExpressionMaybeNoInPtr = booleanFlaggedParser(
    function (noIn) {
      return new Parser(
        "expression",
        function (t) {
          return assignmentExpressionMaybeNoIn[noIn].parse(t);
        });
    });
  var assignmentExpressionPtr = assignmentExpressionMaybeNoInPtr[false];

  var functionBodyPtr = new Parser(
    "functionBody", function (t) {
      return functionBody.parse(t);
    });

  var statementPtr = new Parser(
    "statement", function (t) {
      return statement.parse(t);
    });

  var arrayLiteral =
        node('array',
             seq(token('['),
                 opt(list(token(','))),
                 or(
                   lookAheadToken(']'),
                   list(
                     expecting(
                       'expression',
                       or(assignmentExpressionPtr,
                          // count a peeked-at ']' as an expression
                          // to support elisions at end, e.g.
                          // `[1,2,3,,,,,,]`.
                          lookAheadToken(']'))),
                     // list seperator is one or more commas
                     // to support elision
                     list(token(',')))),
                 token(']')));

  var propertyName = expecting('propertyName', or(
    node('idPropName', tokenType('IDENTIFIER')),
    node('numPropName', tokenType('NUMBER')),
    node('strPropName', tokenType('STRING'))));
  var nameColonValue = expecting(
    'propertyName',
    node('prop', seq(propertyName, token(':'), assignmentExpressionPtr)));

  var objectLiteral =
        node('object',
             seq(token('{'),
                 or(lookAheadToken('}'),
                    list(nameColonValue,
                         token(','))),
                 token('}')));

  var functionMaybeNameRequired = booleanFlaggedParser(
    function (nameRequired) {
      return seq(token('function'),
                 (nameRequired ? tokenType('IDENTIFIER') :
                  or(tokenType('IDENTIFIER'),
                     and(lookAheadToken('('), constant(NIL)))),
                 token('('),
                 or(lookAheadToken(')'),
                    list(tokenType('IDENTIFIER'), token(','))),
                 token(')'),
                 token('{'),
                 functionBodyPtr,
                 token('}'));
    });
  var functionExpression = node('functionExpr',
                                functionMaybeNameRequired[false]);

  var primaryOrFunctionExpression =
        expecting('expression',
                  or(node('this', token('this')),
                     node('identifier', tokenType('IDENTIFIER')),
                     node('number', tokenType('NUMBER')),
                     node('boolean', tokenType('BOOLEAN')),
                     node('null', tokenType('NULL')),
                     node('regex', tokenType('REGEX')),
                     node('string', tokenType('STRING')),
                     node('parens',
                          seq(token('('), expressionPtr, token(')'))),
                     arrayLiteral,
                     objectLiteral,
                     functionExpression));

  var dotEnding = seq(token('.'), tokenType('IDENTIFIER'));
  var bracketEnding = seq(token('['), expressionPtr, token(']'));
  var callArgs = seq(token('('),
                     or(lookAheadToken(')'),
                        list(assignmentExpressionPtr,
                             token(','))),
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
  var lhsExpression = new Parser(
    'expression',
    function (t) {
      // Accumulate all initial "new" keywords, not yet knowing
      // if they have a corresponding argument list later.
      var news = [];
      var n;
      while ((n = newKeyword.parse(t)))
        news.push(n);

      // Read the primaryOrFunctionExpression that will be the "core"
      // of this lhsExpression.  It is preceded by zero or more `new`
      // keywords, and followed by any sequence of (...), [...],
      // and .foo add-ons.
      // if we have 'new' keywords, we are committed and must
      // match an expression or error.
      var result = primaryOrFunctionExpression.parse(
        t, {required: news.length});
      if (! result)
        return null;

      // Our plan of attack is to apply each dot, bracket, or call
      // as we come across it.  Whether a call is a `new` call depends
      // on whether there are `new` keywords we haven't used.  If so,
      // we pop one off the stack.
      var done = false;
      while (! done) {
        var r;
        if ((r = dotEnding.parse(t))) {
          result = new ParseNode('dot', [result].concat(r));
        } else if ((r = bracketEnding.parse(t))) {
          result = new ParseNode('bracket', [result].concat(r));
        } else if ((r = callArgs.parse(t))) {
          if (news.length)
            result = new ParseNode('newcall', [news.pop(), result].concat(r));
          else
            result = new ParseNode('call', [result].concat(r));
        } else {
          done = true;
        }
      }

      // There may be more `new` keywords than calls, which is how
      // paren-less constructions (`new Date`) are parsed.  We've
      // already handled `new foo().bar()`, now handle `new new foo().bar`.
      while (news.length)
        result = new ParseNode('new', [news.pop(), result]);

      return result;
    });

  var postfixToken = token('++ --');
  var postfixLookahead = lookAheadToken('++ --');
  var postfixExpression = expecting(
    'expression',
    mapResult(seq(lhsExpression,
                  opt(and(noLineTerminatorHere,
                          postfixLookahead,
                          postfixToken))),
              function (v) {
                if (v.length === 1)
                  return v[0];
                return new ParseNode('postfix', v);
              }));

  var unaryExpression = unary(
    'unary', postfixExpression,
    or(token('delete void typeof'),
       preSlashToken('++ -- + - ~ !', false)));

  // The "noIn" business is all to facilitate parsing
  // of for-in constructs, though the cases that make
  // this required are quite obscure.
  // The `for(var x in y)` form is allowed to take
  // an initializer for `x` (which is only useful for
  // its side effects, or if `y` has no properties).
  // So an example might be:
  // `for(var x = a().b in c);`
  // In this example, `var x = a().b` is parsed without
  // the `in`, which would otherwise be part of the
  // varDecl, using varDeclNoIn.

  // Our binaryExpression is the spec's LogicalORExpression,
  // which includes all the higher-precendence operators.
  var binaryExpressionMaybeNoIn = booleanFlaggedParser(
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
      return expecting(
        'expression',
        binaryLeft('binary', unaryExpression, binaryOps));
    });
  var binaryExpression = binaryExpressionMaybeNoIn[false];

  var conditionalExpressionMaybeNoIn = booleanFlaggedParser(
    function (noIn) {
      return expecting(
        'expression',
        mapResult(
          seq(binaryExpressionMaybeNoIn[noIn],
              opt(seq(
                token('?'),
                assignmentExpressionPtr, token(':'),
                assignmentExpressionMaybeNoInPtr[noIn]))),
          function (v) {
            if (v.length === 1)
              return v[0];
            return new ParseNode('ternary', v);
          }));
    });
  var conditionalExpression = conditionalExpressionMaybeNoIn[false];

  var assignOp = token('= *= /= %= += -= <<= >>= >>>= &= ^= |=');

  var assignmentExpressionMaybeNoIn = booleanFlaggedParser(
    function (noIn) {
      return new Parser(
        'expression',
        function (t) {
          var r = conditionalExpressionMaybeNoIn[noIn].parse(t);
          if (! r)
            return null;

          // Assignment is right-associative.
          // Plan of attack: make a list of all the parts
          // [expression, op, expression, op, ... expression]
          // and then fold them up at the end.
          var parts = [r];
          var op;
          while (isExpressionLHS(r) &&(op = assignOp.parse(t)))
            parts.push(op,
                       conditionalExpressionMaybeNoIn[noIn].parse(
                         t, {required: true}));

          var result = parts.pop();
          while (parts.length) {
            op = parts.pop();
            var lhs = parts.pop();
            result = new ParseNode('assignment', [lhs, op, result]);
          }
          return result;
        });
    });
  var assignmentExpression = assignmentExpressionMaybeNoIn[false];

  var expressionMaybeNoIn = booleanFlaggedParser(
    function (noIn) {
      return expecting(
        'expression',
        mapResult(
          list(assignmentExpressionMaybeNoIn[noIn], token(',')),
          function (v) {
            if (v.length === 1)
              return v[0];
            return new ParseNode('comma', v);
          }));
    });
  var expression = expressionMaybeNoIn[false];

  // STATEMENTS

  var statements = list(statementPtr);

  // implements JavaScript's semicolon "insertion" rules
  var maybeSemicolon = expecting(
    'semicolon',
    or(token(';'),
       and(
         or(
           lookAheadToken('}'),
           lookAheadTokenType('EOF'),
           assertion(function (t) {
             return t.isLineTerminatorHere;
           })),
         constant(new ParseNode(';', [])))));

  var expressionStatement = node(
    'expressionStmnt',
    and(
      not(or(lookAheadToken('{'), lookAheadToken('function'))),
      seq(expression,
          expecting('semicolon',
                    or(maybeSemicolon,
                       // allow presence of colon to terminate
                       // statement legally, for the benefit of
                       // expressionOrLabelStatement.  Basically assume
                       // an implicit semicolon.  This
                       // is safe because a colon can never legally
                       // follow a semicolon anyway.
                       and(lookAheadToken(':'),
                           constant(new ParseNode(';', []))))))));

  // it's hard to parse statement labels, as in
  // `foo: x = 1`, because we can't tell from the
  // first token whether we are looking at an expression
  // statement or a label statement.  To work around this,
  // expressionOrLabelStatement parses the expression and
  // then rewrites the result if it is an identifier
  // followed by a colon.
  var labelColonAndStatement = seq(token(':'), statementPtr);
  var noColon = expecting(
    'semicolon', not(lookAheadToken(':')));
  var expressionOrLabelStatement = new Parser(
    null,
    function (t) {
      var exprStmnt = expressionStatement.parse(t);
      if (! exprStmnt)
        return null;

      var expr = exprStmnt.children[0];
      var maybeSemi = exprStmnt.children[1];
      if (expr.name !== 'identifier' ||
          ! (maybeSemi instanceof ParseNode)) {
        // We either have a non-identifier expression or a present
        // semicolon.  This is not a label.
        //
        // Fail now if we are looking at a colon, causing an
        // error message on input like `1+1:` of the same kind
        // you'd get without statement label parsing.
        noColon.parse(t, {required: true});
        return exprStmnt;
      }

      var rest = labelColonAndStatement.parse(t);
      if (! rest)
        return exprStmnt;

      return new ParseNode('labelStmnt',
                           [expr.children[0]].concat(rest));
    });

  var emptyStatement = node('emptyStmnt', token(';')); // required semicolon

  var blockStatement = expecting('block', node('blockStmnt', seq(
    token('{'), or(lookAheadToken('}'), statements),
    token('}'))));

  var varDeclMaybeNoIn = booleanFlaggedParser(function (noIn) {
    return node(
      'varDecl',
      seq(tokenType('IDENTIFIER'),
          opt(seq(token('='),
                  assignmentExpressionMaybeNoIn[noIn]))));
  });
  var varDecl = varDeclMaybeNoIn[false];

  var variableStatement = node(
    'varStmnt',
    seq(token('var'), list(varDecl, token(',')),
        maybeSemicolon));

  // A paren that may be followed by a statement
  // beginning with a regex literal.
  var closeParenBeforeStatement = preSlashToken(')', false);

  var ifStatement = node(
    'ifStmnt',
    seq(token('if'), token('('), expression,
        closeParenBeforeStatement, statementPtr,
        opt(seq(token('else'), statementPtr))));

  var secondThirdClauses = expecting(
    'semicolon',
    and(lookAheadToken(';'),
        seq(
          expecting('semicolon', token(';')),
          or(and(lookAheadToken(';'),
                 constant(NIL)),
             expressionPtr),
          expecting('semicolon', token(';')),
          or(and(lookAheadToken(')'),
                 constant(NIL)),
             expressionPtr))));
  var inExpr = seq(token('in'), expression);
  var inExprExpectingSemi = expecting('semicolon',
                                      seq(token('in'), expression));
  var forSpec = mapResult(node(
    'forSpec',
    or(seq(token('var'),
           varDeclMaybeNoIn[true],
           expecting(
             'commaOrIn',
             or(inExpr,
                seq(
                  or(
                    lookAheadToken(';'),
                    seq(token(','),
                        list(varDeclMaybeNoIn[true], token(',')))),
                  secondThirdClauses)))),
       // get the case where the first clause is empty out of the way.
       // the lookAhead's return value is the empty placeholder for the
       // missing expression.
       seq(and(lookAheadToken(';'),
               constant(NIL)), secondThirdClauses),
       // custom parser the non-var case because we have to
       // read the first expression before we know if there's
       // an "in".
       new Parser(
         null,
         function (t) {
           var firstExpr = expressionMaybeNoIn[true].parse(t);
           if (! firstExpr)
             return null;
           var rest = secondThirdClauses.parse(t);
           if (! rest) {
             // we need a left-hand-side expression for a
             // `for (x in y)` loop.
             if (! isExpressionLHS(firstExpr))
               throw t.getParseError("semicolon");
             // if we don't see 'in' at this point, it's probably
             // a missing semicolon
             rest = inExprExpectingSemi.parse(t, {required: true});
           }

           return [firstExpr].concat(rest);
         }))),
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
                            var numChildren = clauses.children.length;
                            if (numChildren === 3)
                              return new ParseNode('forInSpec', clauses.children);
                            else if (numChildren === 4)
                              return new ParseNode('forVarInSpec', clauses.children);
                            else if (numChildren >= 6)
                              return new ParseNode('forVarSpec', clauses.children);
                            return clauses;
                          });

  var iterationStatement = or(
    node('doStmnt', seq(token('do'), statementPtr, token('while'),
                        token('('), expression, token(')'),
                        maybeSemicolon)),
    node('whileStmnt', seq(token('while'), token('('), expression,
                           closeParenBeforeStatement, statementPtr)),
    // semicolons must be real, not maybeSemicolons
    node('forStmnt', seq(
      token('for'), token('('), forSpec, closeParenBeforeStatement,
      statementPtr)));

  var returnStatement = node(
    'returnStmnt',
    seq(token('return'), or(
      and(noLineTerminatorHere, expression), constant(NIL)),
        maybeSemicolon));
  var continueStatement = node(
    'continueStmnt',
    seq(token('continue'), or(
      and(noLineTerminatorHere, tokenType('IDENTIFIER')), constant(NIL)),
        maybeSemicolon));
  var breakStatement = node(
    'breakStmnt',
    seq(token('break'), or(
      and(noLineTerminatorHere, tokenType('IDENTIFIER')), constant(NIL)),
        maybeSemicolon));
  var throwStatement = node(
    'throwStmnt',
    seq(token('throw'),
        and(or(noLineTerminatorHere,
               // If there is a line break here and more tokens after,
               // we want to error appropriately.  `throw \n e` should
               // complain about the "end of line", not the `e`.
               and(not(lookAheadTokenType("EOF")),
                   new Parser(null,
                              function (t) {
                                throw t.getParseError('expression', 'end of line');
                              }))),
            expression),
        maybeSemicolon));

  var withStatement = node(
    'withStmnt',
    seq(token('with'), token('('), expression, closeParenBeforeStatement,
        statementPtr));

  var switchCase = node(
    'case',
    seq(token('case'), expression, token(':'),
        or(lookAheadToken('}'),
           lookAheadToken('case default'),
           statements)));
  var switchDefault = node(
    'default',
    seq(token('default'), token(':'),
        or(lookAheadToken('}'),
           lookAheadToken('case'),
           statements)));

  var switchStatement = node(
    'switchStmnt',
    seq(token('switch'), token('('), expression, token(')'),
        token('{'),
        or(lookAheadToken('}'),
           lookAheadToken('default'),
           list(switchCase)),
        opt(seq(switchDefault,
                opt(list(switchCase)))),
        token('}')));

  var catchFinally = expecting(
    'catch',
    and(lookAheadToken('catch finally'),
        seq(
          or(node(
            'catch',
            seq(token('catch'), token('('), tokenType('IDENTIFIER'),
                token(')'), blockStatement)),
             constant(NIL)),
          or(node(
            'finally',
            seq(token('finally'), blockStatement)),
             constant(NIL)))));
  var tryStatement = node(
    'tryStmnt',
    seq(token('try'), blockStatement, catchFinally));
  var debuggerStatement = node(
    'debuggerStmnt', seq(token('debugger'), maybeSemicolon));

  var statement = expecting('statement',
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

  var functionDecl = node(
    'functionDecl', functionMaybeNameRequired[true]);

  var sourceElement = or(functionDecl, statement);
  var sourceElements = list(sourceElement);

  var functionBody = expecting(
    'functionBody', or(lookAheadToken('}'), sourceElements));

  var program = node(
    'program',
    seq(opt(sourceElements),
        // If not at EOF, complain "expecting statement"
        expecting('statement', lookAheadTokenType("EOF"))));

  return program.parse(this);
};

})();