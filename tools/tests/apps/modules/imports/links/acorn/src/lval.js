import {types as tt} from "./tokentype"
import {Parser} from "./state"
import {has} from "./util"

const pp = Parser.prototype

// Convert existing expression atom to assignable pattern
// if possible.

pp.toAssignable = function(node, isBinding, refDestructuringErrors) {
  if (this.options.ecmaVersion >= 6 && node) {
    switch (node.type) {
    case "Identifier":
      if (this.inAsync && node.name === "await")
        this.raise(node.start, "Can not use 'await' as identifier inside an async function")
      break

    case "ObjectPattern":
    case "ArrayPattern":
    case "RestElement":
      break

    case "ObjectExpression":
      node.type = "ObjectPattern"
      if (refDestructuringErrors) this.checkPatternErrors(refDestructuringErrors, true)
      for (let prop of node.properties) {
        this.toAssignable(prop, isBinding)
        // Early error:
        //   AssignmentRestProperty[Yield, Await] :
        //     `...` DestructuringAssignmentTarget[Yield, Await]
        //
        //   It is a Syntax Error if |DestructuringAssignmentTarget| is an |ArrayLiteral| or an |ObjectLiteral|.
        if (
          prop.type === "RestElement" &&
          (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")
        ) {
          this.raise(prop.argument.start, "Unexpected token")
        }
      }
      break

    case "Property":
      // AssignmentProperty has type == "Property"
      if (node.kind !== "init") this.raise(node.key.start, "Object pattern can't contain getter or setter")
      this.toAssignable(node.value, isBinding)
      break

    case "ArrayExpression":
      node.type = "ArrayPattern"
      if (refDestructuringErrors) this.checkPatternErrors(refDestructuringErrors, true)
      this.toAssignableList(node.elements, isBinding)
      break

    case "SpreadElement":
      node.type = "RestElement"
      this.toAssignable(node.argument, isBinding)
      if (node.argument.type === "AssignmentPattern")
        this.raise(node.argument.start, "Rest elements cannot have a default value")
      break

    case "AssignmentExpression":
      if (node.operator !== "=") this.raise(node.left.end, "Only '=' operator can be used for specifying default value.")
      node.type = "AssignmentPattern"
      delete node.operator
      this.toAssignable(node.left, isBinding)
      // falls through to AssignmentPattern

    case "AssignmentPattern":
      break

    case "ParenthesizedExpression":
      this.toAssignable(node.expression, isBinding)
      break

    case "MemberExpression":
      if (!isBinding) break

    default:
      this.raise(node.start, "Assigning to rvalue")
    }
  } else if (refDestructuringErrors) this.checkPatternErrors(refDestructuringErrors, true)
  return node
}

// Convert list of expression atoms to binding list.

pp.toAssignableList = function(exprList, isBinding) {
  let end = exprList.length
  for (let i = 0; i < end; i++) {
    let elt = exprList[i]
    if (elt) this.toAssignable(elt, isBinding)
  }
  if (end) {
    let last = exprList[end - 1]
    if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier")
      this.unexpected(last.argument.start)
  }
  return exprList
}

// Parses spread element.

pp.parseSpread = function(refDestructuringErrors) {
  let node = this.startNode()
  this.next()
  node.argument = this.parseMaybeAssign(false, refDestructuringErrors)
  return this.finishNode(node, "SpreadElement")
}

pp.parseRestBinding = function() {
  let node = this.startNode()
  this.next()

  // RestElement inside of a function parameter must be an identifier
  if (this.options.ecmaVersion === 6 && this.type !== tt.name)
    this.unexpected()

  node.argument = this.parseBindingAtom()

  return this.finishNode(node, "RestElement")
}

// Parses lvalue (assignable) atom.

pp.parseBindingAtom = function() {
  if (this.options.ecmaVersion >= 6) {
    switch (this.type) {
    case tt.bracketL:
      let node = this.startNode()
      this.next()
      node.elements = this.parseBindingList(tt.bracketR, true, true)
      return this.finishNode(node, "ArrayPattern")

    case tt.braceL:
      return this.parseObj(true)
    }
  }
  return this.parseIdent()
}

pp.parseBindingList = function(close, allowEmpty, allowTrailingComma) {
  let elts = [], first = true
  while (!this.eat(close)) {
    if (first) first = false
    else this.expect(tt.comma)
    if (allowEmpty && this.type === tt.comma) {
      elts.push(null)
    } else if (allowTrailingComma && this.afterTrailingComma(close)) {
      break
    } else if (this.type === tt.ellipsis) {
      let rest = this.parseRestBinding()
      this.parseBindingListItem(rest)
      elts.push(rest)
      if (this.type === tt.comma) this.raise(this.start, "Comma is not permitted after the rest element")
      this.expect(close)
      break
    } else {
      let elem = this.parseMaybeDefault(this.start, this.startLoc)
      this.parseBindingListItem(elem)
      elts.push(elem)
    }
  }
  return elts
}

pp.parseBindingListItem = function(param) {
  return param
}

// Parses assignment pattern around given atom if possible.

pp.parseMaybeDefault = function(startPos, startLoc, left) {
  left = left || this.parseBindingAtom()
  if (this.options.ecmaVersion < 6 || !this.eat(tt.eq)) return left
  let node = this.startNodeAt(startPos, startLoc)
  node.left = left
  node.right = this.parseMaybeAssign()
  return this.finishNode(node, "AssignmentPattern")
}

// Verify that a node is an lval — something that can be assigned
// to.
// bindingType can be either:
// 'var' indicating that the lval creates a 'var' binding
// 'let' indicating that the lval creates a lexical ('let' or 'const') binding
// 'none' indicating that the binding should be checked for illegal identifiers, but not for duplicate references

pp.checkLVal = function(expr, bindingType, checkClashes) {
  switch (expr.type) {
  case "Identifier":
    if (this.strict && this.reservedWordsStrictBind.test(expr.name))
      this.raiseRecoverable(expr.start, (bindingType ? "Binding " : "Assigning to ") + expr.name + " in strict mode")
    if (checkClashes) {
      if (has(checkClashes, expr.name))
        this.raiseRecoverable(expr.start, "Argument name clash")
      checkClashes[expr.name] = true
    }
    if (bindingType && bindingType !== "none") {
      if (
        bindingType === "var" && !this.canDeclareVarName(expr.name) ||
        bindingType !== "var" && !this.canDeclareLexicalName(expr.name)
      ) {
        this.raiseRecoverable(expr.start, `Identifier '${expr.name}' has already been declared`)
      }
      if (bindingType === "var") {
        this.declareVarName(expr.name)
      } else {
        this.declareLexicalName(expr.name)
      }
    }
    break

  case "MemberExpression":
    if (bindingType) this.raiseRecoverable(expr.start, "Binding member expression")
    break

  case "ObjectPattern":
    for (let prop of expr.properties)
      this.checkLVal(prop, bindingType, checkClashes)
    break

  case "Property":
    // AssignmentProperty has type == "Property"
    this.checkLVal(expr.value, bindingType, checkClashes)
    break

  case "ArrayPattern":
    for (let elem of expr.elements) {
      if (elem) this.checkLVal(elem, bindingType, checkClashes)
    }
    break

  case "AssignmentPattern":
    this.checkLVal(expr.left, bindingType, checkClashes)
    break

  case "RestElement":
    this.checkLVal(expr.argument, bindingType, checkClashes)
    break

  case "ParenthesizedExpression":
    this.checkLVal(expr.expression, bindingType, checkClashes)
    break

  default:
    this.raise(expr.start, (bindingType ? "Binding" : "Assigning to") + " rvalue")
  }
}
