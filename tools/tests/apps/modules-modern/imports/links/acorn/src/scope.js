import {Parser} from "./state"
import {SCOPE_VAR, SCOPE_FUNCTION, SCOPE_TOP, SCOPE_ARROW, SCOPE_SIMPLE_CATCH, BIND_LEXICAL, BIND_SIMPLE_CATCH, BIND_FUNCTION} from "./scopeflags"

const pp = Parser.prototype

class Scope {
  constructor(flags) {
    this.flags = flags
    // A list of var-declared names in the current lexical scope
    this.var = []
    // A list of lexically-declared names in the current lexical scope
    this.lexical = []
    // A list of lexically-declared FunctionDeclaration names in the current lexical scope
    this.functions = []
  }
}

// The functions in this module keep track of declared variables in the current scope in order to detect duplicate variable names.

pp.enterScope = function(flags) {
  this.scopeStack.push(new Scope(flags))
}

pp.exitScope = function() {
  this.scopeStack.pop()
}

// The spec says:
// > At the top level of a function, or script, function declarations are
// > treated like var declarations rather than like lexical declarations.
pp.treatFunctionsAsVarInScope = function(scope) {
  return (scope.flags & SCOPE_FUNCTION) || !this.inModule && (scope.flags & SCOPE_TOP)
}

pp.declareName = function(name, bindingType, pos) {
  let redeclared = false
  if (bindingType === BIND_LEXICAL) {
    const scope = this.currentScope()
    redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1
    scope.lexical.push(name)
    if (this.inModule && (scope.flags & SCOPE_TOP))
      delete this.undefinedExports[name]
  } else if (bindingType === BIND_SIMPLE_CATCH) {
    const scope = this.currentScope()
    scope.lexical.push(name)
  } else if (bindingType === BIND_FUNCTION) {
    const scope = this.currentScope()
    if (this.treatFunctionsAsVar)
      redeclared = scope.lexical.indexOf(name) > -1
    else
      redeclared = scope.lexical.indexOf(name) > -1 || scope.var.indexOf(name) > -1
    scope.functions.push(name)
  } else {
    for (let i = this.scopeStack.length - 1; i >= 0; --i) {
      const scope = this.scopeStack[i]
      if (scope.lexical.indexOf(name) > -1 && !((scope.flags & SCOPE_SIMPLE_CATCH) && scope.lexical[0] === name) ||
          !this.treatFunctionsAsVarInScope(scope) && scope.functions.indexOf(name) > -1) {
        redeclared = true
        break
      }
      scope.var.push(name)
      if (this.inModule && (scope.flags & SCOPE_TOP))
        delete this.undefinedExports[name]
      if (scope.flags & SCOPE_VAR) break
    }
  }
  if (redeclared) this.raiseRecoverable(pos, `Identifier '${name}' has already been declared`)
}

pp.checkLocalExport = function(id) {
  // scope.functions must be empty as Module code is always strict.
  if (this.scopeStack[0].lexical.indexOf(id.name) === -1 &&
      this.scopeStack[0].var.indexOf(id.name) === -1) {
    this.undefinedExports[id.name] = id
  }
}

pp.currentScope = function() {
  return this.scopeStack[this.scopeStack.length - 1]
}

pp.currentVarScope = function() {
  for (let i = this.scopeStack.length - 1;; i--) {
    let scope = this.scopeStack[i]
    if (scope.flags & SCOPE_VAR) return scope
  }
}

// Could be useful for `this`, `new.target`, `super()`, `super.property`, and `super[property]`.
pp.currentThisScope = function() {
  for (let i = this.scopeStack.length - 1;; i--) {
    let scope = this.scopeStack[i]
    if (scope.flags & SCOPE_VAR && !(scope.flags & SCOPE_ARROW)) return scope
  }
}
