///// JAVASCRIPT PARSER

// What we don't support from ECMA-262 5.1:
//  - object literal trailing comma
//  - object literal get/set

var expecting = Parser.expecting;

var assertion = Parsers.assertion;
var node = Parsers.node;
var or = Parsers.or;
var and = Parsers.and;
var not = Parsers.not;
var list = Parsers.list;
var seq = Parsers.seq;
var opt = Parsers.opt;
var constant = Parsers.constant;
var mapResult = Parsers.mapResult;


var makeSet = function (array) {
  var s = {};
  for (var i = 0, N = array.length; i < N; i++)
    s[array[i]] = true;
  return s;
};


JSParser = function (code, options) {
  this.lexer = new JSLexer(code);
  this.oldToken = null;
  this.newToken = null;
  this.pos = 0;
  this.isLineTerminatorHere = false;
  this.includeComments = false;
  // the last COMMENT lexeme between oldToken and newToken
  // that we've consumed, if any.
  this.lastCommentConsumed = null;

  options = options || {};
  // pass {tokens:'strings'} to get strings for
  // tokens instead of token objects
  if (options.tokens === 'strings') {
    this.tokenFunc = function (tok) {
      return tok.text();
    };
  } else {
    this.tokenFunc = function (tok) {
      return tok;
    };
  }

  // pass {includeComments: true} to include comments in the AST.  For
  // a comment to be included, it must occur where a series of
  // statements could occur, and it must be preceded by only comments
  // and whitespace on the same line.
  if (options.includeComments) {
    this.includeComments = true;
  }
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
      throw new Error("Bad token at " +
                      JSLexer.prettyOffset(lexer.code, lex.startPos()) +
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
  self.lastCommentConsumed = null;
};

JSParser.prototype.getParseError = function (expecting, found) {
  var msg = (expecting ? "Expected " + expecting : "Unexpected token");
  if (this.oldToken)
    msg += " after " + this.oldToken;
  var pos = this.pos;
  msg += " at " + JSLexer.prettyOffset(this.lexer.code, pos);
  msg += ", found " + (found || this.newToken);
  return new Error(msg);
};

JSParser.prototype.getSyntaxTree = function () {
  var self = this;

  self.consumeNewToken();

  var NIL = new ParseNode('nil', []);

  var booleanFlaggedParser = function (parserConstructFunc) {
    return {
      'false': parserConstructFunc(false),
      'true': parserConstructFunc(true)
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
          return self.tokenFunc(t.oldToken);
        }
        return null;
      });
  };

  var tokenType = function (type) {
    return new Parser(type, function (t) {
      if (t.newToken.type() === type) {
        t.consumeNewToken();
        return self.tokenFunc(t.oldToken);
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

  // Mark some productions "lazy" to allow grammar circularity, i.e. accessing
  // later parsers from earlier ones.
  // These lazy versions will be replaced with real ones, which they will
  // access when run.
  var expressionMaybeNoIn = {
    'false': Parsers.lazy(
      'expression',
      function () { return expressionMaybeNoIn[false]; }),
    'true': Parsers.lazy(
      'expression',
      function () { return expressionMaybeNoIn[true]; })
  };
  var expression = expressionMaybeNoIn[false];

  var assignmentExpressionMaybeNoIn = {
    'false': Parsers.lazy(
      'expression',
      function () { return assignmentExpressionMaybeNoIn[false]; }),
    'true': Parsers.lazy(
      'expression',
      function () { return assignmentExpressionMaybeNoIn[true]; })
  };
  var assignmentExpression = assignmentExpressionMaybeNoIn[false];

  var functionBody = Parsers.lazy(
    'statement', function () { return functionBody; });
  var statement = Parsers.lazy(
    'statement', function () { return statement; });
  ////

  var arrayLiteral =
        node('array',
             seq(token('['),
                 opt(list(token(','))),
                 or(
                   lookAheadToken(']'),
                   list(
                     expecting(
                       'expression',
                       or(assignmentExpression,
                          // count a peeked-at ']' as an expression
                          // to support elisions at end, e.g.
                          // `[1,2,3,,,,,,]`.
                          lookAheadToken(']'))),
                     // list seperator is one or more commas
                     // to support elision
                     list(token(',')))),
                 token(']')));

  // "IdentifierName" in ES5 allows reserved words, like in a property access
  // or a key of an object literal.
  // Put IDENTIFIER last so it shows up in the error message.
  var identifierName = or(tokenType('NULL'), tokenType('BOOLEAN'),
                          tokenType('KEYWORD'), tokenType('IDENTIFIER'));

  var propertyName = expecting('propertyName', or(
    node('idPropName', identifierName),
    node('numPropName', tokenType('NUMBER')),
    node('strPropName', tokenType('STRING'))));
  var nameColonValue = expecting(
    'propertyName',
    node('prop', seq(propertyName, token(':'), assignmentExpression)));

  // Allow trailing comma in object literal, per ES5.  Trailing comma
  // must follow a `name:value`, that is, `{,}` is invalid.
  //
  // We can't just use a normal comma list(), because it will seize
  // on the comma as a sign that the list continues.  Instead,
  // we specify a list of either ',' or nameColonValue, using positive
  // and negative lookAheads to constrain the sequence.  The grammar
  // is ordered so that error messages will always say
  // "Expected propertyName" or "Expected ," as appropriate, not
  // "Expected ," when the look-ahead is negative or "Expected }".
  var objectLiteral =
        node('object',
             seq(token('{'),
                 or(lookAheadToken('}'),
                    and(not(lookAheadToken(',')),
                        list(or(seq(token(','),
                                    expecting('propertyName',
                                              not(lookAheadToken(',')))),
                                seq(nameColonValue,
                                    or(lookAheadToken('}'),
                                       lookAheadToken(','))))))),
                 expecting('propertyName', token('}'))));

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
                 functionBody,
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
                          seq(token('('), expression, token(')'))),
                     arrayLiteral,
                     objectLiteral,
                     functionExpression));


  var dotEnding = seq(token('.'), identifierName);
  var bracketEnding = seq(token('['), expression, token(']'));
  var callArgs = seq(token('('),
                     or(lookAheadToken(')'),
                        list(assignmentExpression,
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
      var result = primaryOrFunctionExpression.parseRequiredIf(t, news.length);
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

  var unaryExpression = Parsers.unary(
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
        Parsers.binaryLeft('binary', unaryExpression, binaryOps));
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
                assignmentExpression, token(':'),
                assignmentExpressionMaybeNoIn[noIn]))),
          function (v) {
            if (v.length === 1)
              return v[0];
            return new ParseNode('ternary', v);
          }));
    });
  var conditionalExpression = conditionalExpressionMaybeNoIn[false];

  var assignOp = token('= *= /= %= += -= <<= >>= >>>= &= ^= |=');

  assignmentExpressionMaybeNoIn = booleanFlaggedParser(
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
                       conditionalExpressionMaybeNoIn[noIn].parseRequired(t));

          var result = parts.pop();
          while (parts.length) {
            op = parts.pop();
            var lhs = parts.pop();
            result = new ParseNode('assignment', [lhs, op, result]);
          }
          return result;
        });
    });
  assignmentExpression = assignmentExpressionMaybeNoIn[false];

  expressionMaybeNoIn = booleanFlaggedParser(
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
  expression = expressionMaybeNoIn[false];

  // STATEMENTS

  var comment = node('comment', new Parser(null, function (t) {
    if (! t.includeComments)
      return null;

    // Match a COMMENT lexeme between oldToken and newToken.
    //
    // This is an unusual Parser because it doesn't match and consume
    // newToken, but instead uses the next()/prev() API on lexemes.
    // It assumes it can walk the linked list backwards from newToken
    // (though not necessarily forwards).
    //
    // We start at the last comment we've visited for this
    // oldToken/newToken pair, if any, or else oldToken, or else the
    // beginning of the token stream.  We ignore comments that are
    // preceded by any non-comment source code on the same line.
    var lexeme = (t.lastCommentConsumed || t.oldToken || null);
    if (! lexeme) {
      // no oldToken, must be on first token.  walk backwards
      // to start with first lexeme (which may be a comment
      // or whitespace)
      lexeme = t.newToken;
      while (lexeme.prev())
        lexeme = lexeme.prev();
    } else {
      // start with lexeme after last token or comment consumed
      lexeme = lexeme.next();
    }
    var seenNewline = ((! t.oldToken) || t.lastCommentConsumed || false);
    while (lexeme !== t.newToken) {
      var type = lexeme.type();
      if (type === "NEWLINE") {
        seenNewline = true;
      } else if (type === "COMMENT") {
        t.lastCommentConsumed = lexeme;
        if (seenNewline)
          return lexeme;
      }
      lexeme = lexeme.next();
    }
    return null;
  }));

  var statements = list(or(comment, statement));

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
  var labelColonAndStatement = seq(token(':'), statement);
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
        noColon.parseRequired(t);
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
        closeParenBeforeStatement, statement,
        opt(seq(token('else'), statement))));

  var secondThirdClauses = expecting(
    'semicolon',
    and(lookAheadToken(';'),
        seq(
          expecting('semicolon', token(';')),
          or(and(lookAheadToken(';'),
                 constant(NIL)),
             expression),
          expecting('semicolon', token(';')),
          or(and(lookAheadToken(')'),
                 constant(NIL)),
             expression))));
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
             rest = inExprExpectingSemi.parseRequired(t);
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
    node('doStmnt', seq(token('do'), statement, token('while'),
                        token('('), expression, token(')'),
                        maybeSemicolon)),
    node('whileStmnt', seq(token('while'), token('('), expression,
                           closeParenBeforeStatement, statement)),
    // semicolons must be real, not maybeSemicolons
    node('forStmnt', seq(
      token('for'), token('('), forSpec, closeParenBeforeStatement,
      statement)));

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
        statement));

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

  statement = expecting('statement',
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

  // Look for statement before functionDecl, to catch comments in
  // includeComments mode.  A statement can't start with 'function'
  // anyway, so the order doesn't matter otherwise.
  var sourceElement = or(statement, functionDecl);
  var sourceElements = list(or(comment, sourceElement));

  functionBody = expecting(
    'functionBody', or(lookAheadToken('}'), sourceElements));

  var program = node(
    'program',
    seq(opt(sourceElements),
        // If not at EOF, complain "expecting statement"
        expecting('statement', lookAheadTokenType("EOF"))));

  return program.parse(this);
};
