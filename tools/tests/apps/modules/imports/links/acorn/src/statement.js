import {types as tt} from "./tokentype"
import {Parser} from "./state"
import {lineBreak, skipWhiteSpace} from "./whitespace"
import {isIdentifierStart, isIdentifierChar, keywordRelationalOperator} from "./identifier"
import {has} from "./util"
import {DestructuringErrors} from "./parseutil"

const pp = Parser.prototype

// ### Statement parsing

// Parse a program. Initializes the parser, reads any number of
// statements, and wraps them in a Program node.  Optionally takes a
// `program` argument.  If present, the statements will be appended
// to its body instead of creating a new node.

pp.parseTopLevel = function(node) {
  let exports = {}
  if (!node.body) node.body = []
  while (this.type !== tt.eof) {
    let stmt = this.parseStatement(true, true, exports)
    node.body.push(stmt)
  }
  this.adaptDirectivePrologue(node.body)
  this.next()
  if (this.options.ecmaVersion >= 6) {
    node.sourceType = this.options.sourceType
  }
  return this.finishNode(node, "Program")
}

const loopLabel = {kind: "loop"}, switchLabel = {kind: "switch"}

pp.isLet = function() {
  if (this.options.ecmaVersion < 6 || !this.isContextual("let")) return false
  skipWhiteSpace.lastIndex = this.pos
  let skip = skipWhiteSpace.exec(this.input)
  let next = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next)
  if (nextCh === 91 || nextCh == 123) return true // '{' and '['
  if (isIdentifierStart(nextCh, true)) {
    let pos = next + 1
    while (isIdentifierChar(this.input.charCodeAt(pos), true)) ++pos
    let ident = this.input.slice(next, pos)
    if (!keywordRelationalOperator.test(ident)) return true
  }
  return false
}

// check 'async [no LineTerminator here] function'
// - 'async /*foo*/ function' is OK.
// - 'async /*\n*/ function' is invalid.
pp.isAsyncFunction = function() {
  if (this.options.ecmaVersion < 8 || !this.isContextual("async"))
    return false

  skipWhiteSpace.lastIndex = this.pos
  let skip = skipWhiteSpace.exec(this.input)
  let next = this.pos + skip[0].length
  return !lineBreak.test(this.input.slice(this.pos, next)) &&
    this.input.slice(next, next + 8) === "function" &&
    (next + 8 == this.input.length || !isIdentifierChar(this.input.charAt(next + 8)))
}

// Parse a single statement.
//
// If expecting a statement and finding a slash operator, parse a
// regular expression literal. This is to handle cases like
// `if (foo) /blah/.exec(foo)`, where looking at the previous token
// does not help.

pp.parseStatement = function(declaration, topLevel, exports) {
  let starttype = this.type, node = this.startNode(), kind

  if (this.isLet()) {
    starttype = tt._var
    kind = "let"
  }

  // Most types of statements are recognized by the keyword they
  // start with. Many are trivial to parse, some require a bit of
  // complexity.

  switch (starttype) {
  case tt._break: case tt._continue: return this.parseBreakContinueStatement(node, starttype.keyword)
  case tt._debugger: return this.parseDebuggerStatement(node)
  case tt._do: return this.parseDoStatement(node)
  case tt._for: return this.parseForStatement(node)
  case tt._function:
    if (!declaration && this.options.ecmaVersion >= 6) this.unexpected()
    return this.parseFunctionStatement(node, false)
  case tt._class:
    if (!declaration) this.unexpected()
    return this.parseClass(node, true)
  case tt._if: return this.parseIfStatement(node)
  case tt._return: return this.parseReturnStatement(node)
  case tt._switch: return this.parseSwitchStatement(node)
  case tt._throw: return this.parseThrowStatement(node)
  case tt._try: return this.parseTryStatement(node)
  case tt._const: case tt._var:
    kind = kind || this.value
    if (!declaration && kind != "var") this.unexpected()
    return this.parseVarStatement(node, kind)
  case tt._while: return this.parseWhileStatement(node)
  case tt._with: return this.parseWithStatement(node)
  case tt.braceL: return this.parseBlock()
  case tt.semi: return this.parseEmptyStatement(node)
  case tt._export:
  case tt._import:
    if (!this.options.allowImportExportEverywhere) {
      if (!topLevel)
        this.raise(this.start, "'import' and 'export' may only appear at the top level")
      if (!this.inModule)
        this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'")
    }
    return starttype === tt._import ? this.parseImport(node) : this.parseExport(node, exports)

    // If the statement does not start with a statement keyword or a
    // brace, it's an ExpressionStatement or LabeledStatement. We
    // simply start parsing an expression, and afterwards, if the
    // next token is a colon and the expression was a simple
    // Identifier node, we switch to interpreting it as a label.
  default:
    if (this.isAsyncFunction()) {
      if (!declaration) this.unexpected()
      this.next()
      return this.parseFunctionStatement(node, true)
    }

    let maybeName = this.value, expr = this.parseExpression()
    if (starttype === tt.name && expr.type === "Identifier" && this.eat(tt.colon))
      return this.parseLabeledStatement(node, maybeName, expr)
    else return this.parseExpressionStatement(node, expr)
  }
}

pp.parseBreakContinueStatement = function(node, keyword) {
  let isBreak = keyword == "break"
  this.next()
  if (this.eat(tt.semi) || this.insertSemicolon()) node.label = null
  else if (this.type !== tt.name) this.unexpected()
  else {
    node.label = this.parseIdent()
    this.semicolon()
  }

  // Verify that there is an actual destination to break or
  // continue to.
  let i = 0
  for (; i < this.labels.length; ++i) {
    let lab = this.labels[i]
    if (node.label == null || lab.name === node.label.name) {
      if (lab.kind != null && (isBreak || lab.kind === "loop")) break
      if (node.label && isBreak) break
    }
  }
  if (i === this.labels.length) this.raise(node.start, "Unsyntactic " + keyword)
  return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement")
}

pp.parseDebuggerStatement = function(node) {
  this.next()
  this.semicolon()
  return this.finishNode(node, "DebuggerStatement")
}

pp.parseDoStatement = function(node) {
  this.next()
  this.labels.push(loopLabel)
  node.body = this.parseStatement(false)
  this.labels.pop()
  this.expect(tt._while)
  node.test = this.parseParenExpression()
  if (this.options.ecmaVersion >= 6)
    this.eat(tt.semi)
  else
    this.semicolon()
  return this.finishNode(node, "DoWhileStatement")
}

// Disambiguating between a `for` and a `for`/`in` or `for`/`of`
// loop is non-trivial. Basically, we have to parse the init `var`
// statement or expression, disallowing the `in` operator (see
// the second parameter to `parseExpression`), and then check
// whether the next token is `in` or `of`. When there is no init
// part (semicolon immediately after the opening parenthesis), it
// is a regular `for` loop.

pp.parseForStatement = function(node) {
  this.next()
  let awaitAt = (this.options.ecmaVersion >= 9 && this.inAsync && this.eatContextual("await")) ? this.lastTokStart : -1
  this.labels.push(loopLabel)
  this.enterLexicalScope()
  this.expect(tt.parenL)
  if (this.type === tt.semi) {
    if (awaitAt > -1) this.unexpected(awaitAt)
    return this.parseFor(node, null)
  }
  let isLet = this.isLet()
  if (this.type === tt._var || this.type === tt._const || isLet) {
    let init = this.startNode(), kind = isLet ? "let" : this.value
    this.next()
    this.parseVar(init, true, kind)
    this.finishNode(init, "VariableDeclaration")
    if ((this.type === tt._in || (this.options.ecmaVersion >= 6 && this.isContextual("of"))) && init.declarations.length === 1 &&
        !(kind !== "var" && init.declarations[0].init)) {
      if (this.options.ecmaVersion >= 9) {
        if (this.type === tt._in) {
          if (awaitAt > -1) this.unexpected(awaitAt)
        } else node.await = awaitAt > -1
      }
      return this.parseForIn(node, init)
    }
    if (awaitAt > -1) this.unexpected(awaitAt)
    return this.parseFor(node, init)
  }
  let refDestructuringErrors = new DestructuringErrors
  let init = this.parseExpression(true, refDestructuringErrors)
  if (this.type === tt._in || (this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
    if (this.options.ecmaVersion >= 9) {
      if (this.type === tt._in) {
        if (awaitAt > -1) this.unexpected(awaitAt)
      } else node.await = awaitAt > -1
    }
    this.toAssignable(init, false, refDestructuringErrors)
    this.checkLVal(init)
    return this.parseForIn(node, init)
  } else {
    this.checkExpressionErrors(refDestructuringErrors, true)
  }
  if (awaitAt > -1) this.unexpected(awaitAt)
  return this.parseFor(node, init)
}

pp.parseFunctionStatement = function(node, isAsync) {
  this.next()
  return this.parseFunction(node, true, false, isAsync)
}

pp.parseIfStatement = function(node) {
  this.next()
  node.test = this.parseParenExpression()
  // allow function declarations in branches, but only in non-strict mode
  node.consequent = this.parseStatement(!this.strict && this.type == tt._function)
  node.alternate = this.eat(tt._else) ? this.parseStatement(!this.strict && this.type == tt._function) : null
  return this.finishNode(node, "IfStatement")
}

pp.parseReturnStatement = function(node) {
  if (!this.inFunction && !this.options.allowReturnOutsideFunction)
    this.raise(this.start, "'return' outside of function")
  this.next()

  // In `return` (and `break`/`continue`), the keywords with
  // optional arguments, we eagerly look for a semicolon or the
  // possibility to insert one.

  if (this.eat(tt.semi) || this.insertSemicolon()) node.argument = null
  else { node.argument = this.parseExpression(); this.semicolon() }
  return this.finishNode(node, "ReturnStatement")
}

pp.parseSwitchStatement = function(node) {
  this.next()
  node.discriminant = this.parseParenExpression()
  node.cases = []
  this.expect(tt.braceL)
  this.labels.push(switchLabel)
  this.enterLexicalScope()

  // Statements under must be grouped (by label) in SwitchCase
  // nodes. `cur` is used to keep the node that we are currently
  // adding statements to.

  let cur
  for (let sawDefault = false; this.type != tt.braceR;) {
    if (this.type === tt._case || this.type === tt._default) {
      let isCase = this.type === tt._case
      if (cur) this.finishNode(cur, "SwitchCase")
      node.cases.push(cur = this.startNode())
      cur.consequent = []
      this.next()
      if (isCase) {
        cur.test = this.parseExpression()
      } else {
        if (sawDefault) this.raiseRecoverable(this.lastTokStart, "Multiple default clauses")
        sawDefault = true
        cur.test = null
      }
      this.expect(tt.colon)
    } else {
      if (!cur) this.unexpected()
      cur.consequent.push(this.parseStatement(true))
    }
  }
  this.exitLexicalScope()
  if (cur) this.finishNode(cur, "SwitchCase")
  this.next() // Closing brace
  this.labels.pop()
  return this.finishNode(node, "SwitchStatement")
}

pp.parseThrowStatement = function(node) {
  this.next()
  if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start)))
    this.raise(this.lastTokEnd, "Illegal newline after throw")
  node.argument = this.parseExpression()
  this.semicolon()
  return this.finishNode(node, "ThrowStatement")
}

// Reused empty array added for node fields that are always empty.

const empty = []

pp.parseTryStatement = function(node) {
  this.next()
  node.block = this.parseBlock()
  node.handler = null
  if (this.type === tt._catch) {
    let clause = this.startNode()
    this.next()
    this.expect(tt.parenL)
    clause.param = this.parseBindingAtom()
    this.enterLexicalScope()
    this.checkLVal(clause.param, "let")
    this.expect(tt.parenR)
    clause.body = this.parseBlock(false)
    this.exitLexicalScope()
    node.handler = this.finishNode(clause, "CatchClause")
  }
  node.finalizer = this.eat(tt._finally) ? this.parseBlock() : null
  if (!node.handler && !node.finalizer)
    this.raise(node.start, "Missing catch or finally clause")
  return this.finishNode(node, "TryStatement")
}

pp.parseVarStatement = function(node, kind) {
  this.next()
  this.parseVar(node, false, kind)
  this.semicolon()
  return this.finishNode(node, "VariableDeclaration")
}

pp.parseWhileStatement = function(node) {
  this.next()
  node.test = this.parseParenExpression()
  this.labels.push(loopLabel)
  node.body = this.parseStatement(false)
  this.labels.pop()
  return this.finishNode(node, "WhileStatement")
}

pp.parseWithStatement = function(node) {
  if (this.strict) this.raise(this.start, "'with' in strict mode")
  this.next()
  node.object = this.parseParenExpression()
  node.body = this.parseStatement(false)
  return this.finishNode(node, "WithStatement")
}

pp.parseEmptyStatement = function(node) {
  this.next()
  return this.finishNode(node, "EmptyStatement")
}

pp.parseLabeledStatement = function(node, maybeName, expr) {
  for (let label of this.labels)
    if (label.name === maybeName)
      this.raise(expr.start, "Label '" + maybeName + "' is already declared")
  let kind = this.type.isLoop ? "loop" : this.type === tt._switch ? "switch" : null
  for (let i = this.labels.length - 1; i >= 0; i--) {
    let label = this.labels[i]
    if (label.statementStart == node.start) {
      // Update information about previous labels on this node
      label.statementStart = this.start
      label.kind = kind
    } else break
  }
  this.labels.push({name: maybeName, kind, statementStart: this.start})
  node.body = this.parseStatement(true)
  if (node.body.type == "ClassDeclaration" ||
      node.body.type == "VariableDeclaration" && node.body.kind != "var" ||
      node.body.type == "FunctionDeclaration" && (this.strict || node.body.generator))
    this.raiseRecoverable(node.body.start, "Invalid labeled declaration")
  this.labels.pop()
  node.label = expr
  return this.finishNode(node, "LabeledStatement")
}

pp.parseExpressionStatement = function(node, expr) {
  node.expression = expr
  this.semicolon()
  return this.finishNode(node, "ExpressionStatement")
}

// Parse a semicolon-enclosed block of statements, handling `"use
// strict"` declarations when `allowStrict` is true (used for
// function bodies).

pp.parseBlock = function(createNewLexicalScope = true) {
  let node = this.startNode()
  node.body = []
  this.expect(tt.braceL)
  if (createNewLexicalScope) {
    this.enterLexicalScope()
  }
  while (!this.eat(tt.braceR)) {
    let stmt = this.parseStatement(true)
    node.body.push(stmt)
  }
  if (createNewLexicalScope) {
    this.exitLexicalScope()
  }
  return this.finishNode(node, "BlockStatement")
}

// Parse a regular `for` loop. The disambiguation code in
// `parseStatement` will already have parsed the init statement or
// expression.

pp.parseFor = function(node, init) {
  node.init = init
  this.expect(tt.semi)
  node.test = this.type === tt.semi ? null : this.parseExpression()
  this.expect(tt.semi)
  node.update = this.type === tt.parenR ? null : this.parseExpression()
  this.expect(tt.parenR)
  this.exitLexicalScope()
  node.body = this.parseStatement(false)
  this.labels.pop()
  return this.finishNode(node, "ForStatement")
}

// Parse a `for`/`in` and `for`/`of` loop, which are almost
// same from parser's perspective.

pp.parseForIn = function(node, init) {
  let type = this.type === tt._in ? "ForInStatement" : "ForOfStatement"
  this.next()
  if (type == "ForInStatement") {
    if (init.type === "AssignmentPattern" ||
      (init.type === "VariableDeclaration" && init.declarations[0].init != null &&
       (this.strict || init.declarations[0].id.type !== "Identifier")))
      this.raise(init.start, "Invalid assignment in for-in loop head")
  }
  node.left = init
  node.right = type == "ForInStatement" ? this.parseExpression() : this.parseMaybeAssign()
  this.expect(tt.parenR)
  this.exitLexicalScope()
  node.body = this.parseStatement(false)
  this.labels.pop()
  return this.finishNode(node, type)
}

// Parse a list of variable declarations.

pp.parseVar = function(node, isFor, kind) {
  node.declarations = []
  node.kind = kind
  for (;;) {
    let decl = this.startNode()
    this.parseVarId(decl, kind)
    if (this.eat(tt.eq)) {
      decl.init = this.parseMaybeAssign(isFor)
    } else if (kind === "const" && !(this.type === tt._in || (this.options.ecmaVersion >= 6 && this.isContextual("of")))) {
      this.unexpected()
    } else if (decl.id.type != "Identifier" && !(isFor && (this.type === tt._in || this.isContextual("of")))) {
      this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value")
    } else {
      decl.init = null
    }
    node.declarations.push(this.finishNode(decl, "VariableDeclarator"))
    if (!this.eat(tt.comma)) break
  }
  return node
}

pp.parseVarId = function(decl, kind) {
  decl.id = this.parseBindingAtom(kind)
  this.checkLVal(decl.id, kind, false)
}

// Parse a function declaration or literal (depending on the
// `isStatement` parameter).

pp.parseFunction = function(node, isStatement, allowExpressionBody, isAsync) {
  this.initFunction(node)
  if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync)
    node.generator = this.eat(tt.star)
  if (this.options.ecmaVersion >= 8)
    node.async = !!isAsync

  if (isStatement) {
    node.id = isStatement === "nullableID" && this.type != tt.name ? null : this.parseIdent()
    if (node.id) {
      this.checkLVal(node.id, "var")
    }
  }

  let oldInGen = this.inGenerator, oldInAsync = this.inAsync,
      oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldInFunc = this.inFunction
  this.inGenerator = node.generator
  this.inAsync = node.async
  this.yieldPos = 0
  this.awaitPos = 0
  this.inFunction = true
  this.enterFunctionScope()

  if (!isStatement)
    node.id = this.type == tt.name ? this.parseIdent() : null

  this.parseFunctionParams(node)
  this.parseFunctionBody(node, allowExpressionBody)

  this.inGenerator = oldInGen
  this.inAsync = oldInAsync
  this.yieldPos = oldYieldPos
  this.awaitPos = oldAwaitPos
  this.inFunction = oldInFunc
  return this.finishNode(node, isStatement ? "FunctionDeclaration" : "FunctionExpression")
}

pp.parseFunctionParams = function(node) {
  this.expect(tt.parenL)
  node.params = this.parseBindingList(tt.parenR, false, this.options.ecmaVersion >= 8)
  this.checkYieldAwaitInDefaultParams()
}

// Parse a class declaration or literal (depending on the
// `isStatement` parameter).

pp.parseClass = function(node, isStatement) {
  this.next()

  this.parseClassId(node, isStatement)
  this.parseClassSuper(node)
  let classBody = this.startNode()
  let hadConstructor = false
  classBody.body = []
  this.expect(tt.braceL)
  while (!this.eat(tt.braceR)) {
    const member = this.parseClassMember(classBody)
    if (member && member.type === "MethodDefinition" && member.kind === "constructor") {
      if (hadConstructor) this.raise(member.start, "Duplicate constructor in the same class")
      hadConstructor = true
    }
  }
  node.body = this.finishNode(classBody, "ClassBody")
  return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression")
}

pp.parseClassMember = function(classBody) {
  if (this.eat(tt.semi)) return null

  let method = this.startNode()
  const tryContextual = (k, noLineBreak = false) => {
    const start = this.start, startLoc = this.startLoc
    if (!this.eatContextual(k)) return false
    if (this.type !== tt.parenL && (!noLineBreak || !this.canInsertSemicolon())) return true
    if (method.key) this.unexpected()
    method.computed = false
    method.key = this.startNodeAt(start, startLoc)
    method.key.name = k
    this.finishNode(method.key, "Identifier")
    return false
  }

  method.kind = "method"
  method.static = tryContextual("static")
  let isGenerator = this.eat(tt.star)
  let isAsync = false
  if (!isGenerator) {
    if (this.options.ecmaVersion >= 8 && tryContextual("async", true)) {
      isAsync = true
      isGenerator = this.options.ecmaVersion >= 9 && this.eat(tt.star)
    } else if (tryContextual("get")) {
      method.kind = "get"
    } else if (tryContextual("set")) {
      method.kind = "set"
    }
  }
  if (!method.key) this.parsePropertyName(method)
  let {key} = method
  if (!method.computed && !method.static && (key.type === "Identifier" && key.name === "constructor" ||
      key.type === "Literal" && key.value === "constructor")) {
    if (method.kind !== "method") this.raise(key.start, "Constructor can't have get/set modifier")
    if (isGenerator) this.raise(key.start, "Constructor can't be a generator")
    if (isAsync) this.raise(key.start, "Constructor can't be an async method")
    method.kind = "constructor"
  } else if (method.static && key.type === "Identifier" && key.name === "prototype") {
    this.raise(key.start, "Classes may not have a static property named prototype")
  }
  this.parseClassMethod(classBody, method, isGenerator, isAsync)
  if (method.kind === "get" && method.value.params.length !== 0)
    this.raiseRecoverable(method.value.start, "getter should have no params")
  if (method.kind === "set" && method.value.params.length !== 1)
    this.raiseRecoverable(method.value.start, "setter should have exactly one param")
  if (method.kind === "set" && method.value.params[0].type === "RestElement")
    this.raiseRecoverable(method.value.params[0].start, "Setter cannot use rest params")
  return method
}

pp.parseClassMethod = function(classBody, method, isGenerator, isAsync) {
  method.value = this.parseMethod(isGenerator, isAsync)
  classBody.body.push(this.finishNode(method, "MethodDefinition"))
}

pp.parseClassId = function(node, isStatement) {
  node.id = this.type === tt.name ? this.parseIdent() : isStatement === true ? this.unexpected() : null
}

pp.parseClassSuper = function(node) {
  node.superClass = this.eat(tt._extends) ? this.parseExprSubscripts() : null
}

// Parses module export declaration.

pp.parseExport = function(node, exports) {
  this.next()
  // export * from '...'
  if (this.eat(tt.star)) {
    this.expectContextual("from")
    if (this.type !== tt.string) this.unexpected()
    node.source = this.parseExprAtom()
    this.semicolon()
    return this.finishNode(node, "ExportAllDeclaration")
  }
  if (this.eat(tt._default)) { // export default ...
    this.checkExport(exports, "default", this.lastTokStart)
    let isAsync
    if (this.type === tt._function || (isAsync = this.isAsyncFunction())) {
      let fNode = this.startNode()
      this.next()
      if (isAsync) this.next()
      node.declaration = this.parseFunction(fNode, "nullableID", false, isAsync)
    } else if (this.type === tt._class) {
      let cNode = this.startNode()
      node.declaration = this.parseClass(cNode, "nullableID")
    } else {
      node.declaration = this.parseMaybeAssign()
      this.semicolon()
    }
    return this.finishNode(node, "ExportDefaultDeclaration")
  }
  // export var|const|let|function|class ...
  if (this.shouldParseExportStatement()) {
    node.declaration = this.parseStatement(true)
    if (node.declaration.type === "VariableDeclaration")
      this.checkVariableExport(exports, node.declaration.declarations)
    else
      this.checkExport(exports, node.declaration.id.name, node.declaration.id.start)
    node.specifiers = []
    node.source = null
  } else { // export { x, y as z } [from '...']
    node.declaration = null
    node.specifiers = this.parseExportSpecifiers(exports)
    if (this.eatContextual("from")) {
      if (this.type !== tt.string) this.unexpected()
      node.source = this.parseExprAtom()
    } else {
      // check for keywords used as local names
      for (let spec of node.specifiers) {
        this.checkUnreserved(spec.local)
      }

      node.source = null
    }
    this.semicolon()
  }
  return this.finishNode(node, "ExportNamedDeclaration")
}

pp.checkExport = function(exports, name, pos) {
  if (!exports) return
  if (has(exports, name))
    this.raiseRecoverable(pos, "Duplicate export '" + name + "'")
  exports[name] = true
}

pp.checkPatternExport = function(exports, pat) {
  let type = pat.type
  if (type == "Identifier")
    this.checkExport(exports, pat.name, pat.start)
  else if (type == "ObjectPattern")
    for (let prop of pat.properties)
      this.checkPatternExport(exports, prop)
  else if (type == "ArrayPattern")
    for (let elt of pat.elements) {
      if (elt) this.checkPatternExport(exports, elt)
    }
  else if (type == "Property")
    this.checkPatternExport(exports, pat.value)
  else if (type == "AssignmentPattern")
    this.checkPatternExport(exports, pat.left)
  else if (type == "RestElement")
    this.checkPatternExport(exports, pat.argument)
  else if (type == "ParenthesizedExpression")
    this.checkPatternExport(exports, pat.expression)
}

pp.checkVariableExport = function(exports, decls) {
  if (!exports) return
  for (let decl of decls)
    this.checkPatternExport(exports, decl.id)
}

pp.shouldParseExportStatement = function() {
  return this.type.keyword === "var" ||
    this.type.keyword === "const" ||
    this.type.keyword === "class" ||
    this.type.keyword === "function" ||
    this.isLet() ||
    this.isAsyncFunction()
}

// Parses a comma-separated list of module exports.

pp.parseExportSpecifiers = function(exports) {
  let nodes = [], first = true
  // export { x, y as z } [from '...']
  this.expect(tt.braceL)
  while (!this.eat(tt.braceR)) {
    if (!first) {
      this.expect(tt.comma)
      if (this.afterTrailingComma(tt.braceR)) break
    } else first = false

    let node = this.startNode()
    node.local = this.parseIdent(true)
    node.exported = this.eatContextual("as") ? this.parseIdent(true) : node.local
    this.checkExport(exports, node.exported.name, node.exported.start)
    nodes.push(this.finishNode(node, "ExportSpecifier"))
  }
  return nodes
}

// Parses import declaration.

pp.parseImport = function(node) {
  this.next()
  // import '...'
  if (this.type === tt.string) {
    node.specifiers = empty
    node.source = this.parseExprAtom()
  } else {
    node.specifiers = this.parseImportSpecifiers()
    this.expectContextual("from")
    node.source = this.type === tt.string ? this.parseExprAtom() : this.unexpected()
  }
  this.semicolon()
  return this.finishNode(node, "ImportDeclaration")
}

// Parses a comma-separated list of module imports.

pp.parseImportSpecifiers = function() {
  let nodes = [], first = true
  if (this.type === tt.name) {
    // import defaultObj, { x, y as z } from '...'
    let node = this.startNode()
    node.local = this.parseIdent()
    this.checkLVal(node.local, "let")
    nodes.push(this.finishNode(node, "ImportDefaultSpecifier"))
    if (!this.eat(tt.comma)) return nodes
  }
  if (this.type === tt.star) {
    let node = this.startNode()
    this.next()
    this.expectContextual("as")
    node.local = this.parseIdent()
    this.checkLVal(node.local, "let")
    nodes.push(this.finishNode(node, "ImportNamespaceSpecifier"))
    return nodes
  }
  this.expect(tt.braceL)
  while (!this.eat(tt.braceR)) {
    if (!first) {
      this.expect(tt.comma)
      if (this.afterTrailingComma(tt.braceR)) break
    } else first = false

    let node = this.startNode()
    node.imported = this.parseIdent(true)
    if (this.eatContextual("as")) {
      node.local = this.parseIdent()
    } else {
      this.checkUnreserved(node.imported)
      node.local = node.imported
    }
    this.checkLVal(node.local, "let")
    nodes.push(this.finishNode(node, "ImportSpecifier"))
  }
  return nodes
}

// Set `ExpressionStatement#directive` property for directive prologues.
pp.adaptDirectivePrologue = function(statements) {
  for (let i = 0; i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) {
    statements[i].directive = statements[i].expression.raw.slice(1, -1)
  }
}
pp.isDirectiveCandidate = function(statement) {
  return (
    statement.type === "ExpressionStatement" &&
    statement.expression.type === "Literal" &&
    typeof statement.expression.value === "string" &&
    // Reject parenthesized strings.
    (this.input[statement.start] === "\"" || this.input[statement.start] === "'")
  )
}
