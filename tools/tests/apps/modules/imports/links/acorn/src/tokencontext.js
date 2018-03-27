// The algorithm used to determine whether a regexp can appear at a
// given point in the program is loosely based on sweet.js' approach.
// See https://github.com/mozilla/sweet.js/wiki/design

import {Parser} from "./state"
import {types as tt} from "./tokentype"
import {lineBreak} from "./whitespace"

export class TokContext {
  constructor(token, isExpr, preserveSpace, override, generator) {
    this.token = token
    this.isExpr = !!isExpr
    this.preserveSpace = !!preserveSpace
    this.override = override
    this.generator = !!generator
  }
}

export const types = {
  b_stat: new TokContext("{", false),
  b_expr: new TokContext("{", true),
  b_tmpl: new TokContext("${", false),
  p_stat: new TokContext("(", false),
  p_expr: new TokContext("(", true),
  q_tmpl: new TokContext("`", true, true, p => p.tryReadTemplateToken()),
  f_stat: new TokContext("function", false),
  f_expr: new TokContext("function", true),
  f_expr_gen: new TokContext("function", true, false, null, true),
  f_gen: new TokContext("function", false, false, null, true)
}

const pp = Parser.prototype

pp.initialContext = function() {
  return [types.b_stat]
}

pp.braceIsBlock = function(prevType) {
  let parent = this.curContext()
  if (parent === types.f_expr || parent === types.f_stat)
    return true
  if (prevType === tt.colon && (parent === types.b_stat || parent === types.b_expr))
    return !parent.isExpr

  // The check for `tt.name && exprAllowed` detects whether we are
  // after a `yield` or `of` construct. See the `updateContext` for
  // `tt.name`.
  if (prevType === tt._return || prevType == tt.name && this.exprAllowed)
    return lineBreak.test(this.input.slice(this.lastTokEnd, this.start))
  if (prevType === tt._else || prevType === tt.semi || prevType === tt.eof || prevType === tt.parenR || prevType == tt.arrow)
    return true
  if (prevType == tt.braceL)
    return parent === types.b_stat
  if (prevType == tt._var || prevType == tt.name)
    return false
  return !this.exprAllowed
}

pp.inGeneratorContext = function() {
  for (let i = this.context.length - 1; i >= 1; i--) {
    let context = this.context[i]
    if (context.token === "function")
      return context.generator
  }
  return false
}

pp.updateContext = function(prevType) {
  let update, type = this.type
  if (type.keyword && prevType == tt.dot)
    this.exprAllowed = false
  else if (update = type.updateContext)
    update.call(this, prevType)
  else
    this.exprAllowed = type.beforeExpr
}

// Token-specific context update code

tt.parenR.updateContext = tt.braceR.updateContext = function() {
  if (this.context.length == 1) {
    this.exprAllowed = true
    return
  }
  let out = this.context.pop()
  if (out === types.b_stat && this.curContext().token === "function") {
    out = this.context.pop()
  }
  this.exprAllowed = !out.isExpr
}

tt.braceL.updateContext = function(prevType) {
  this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr)
  this.exprAllowed = true
}

tt.dollarBraceL.updateContext = function() {
  this.context.push(types.b_tmpl)
  this.exprAllowed = true
}

tt.parenL.updateContext = function(prevType) {
  let statementParens = prevType === tt._if || prevType === tt._for || prevType === tt._with || prevType === tt._while
  this.context.push(statementParens ? types.p_stat : types.p_expr)
  this.exprAllowed = true
}

tt.incDec.updateContext = function() {
  // tokExprAllowed stays unchanged
}

tt._function.updateContext = tt._class.updateContext = function(prevType) {
  if (prevType.beforeExpr && prevType !== tt.semi && prevType !== tt._else &&
      !((prevType === tt.colon || prevType === tt.braceL) && this.curContext() === types.b_stat))
    this.context.push(types.f_expr)
  else
    this.context.push(types.f_stat)
  this.exprAllowed = false
}

tt.backQuote.updateContext = function() {
  if (this.curContext() === types.q_tmpl)
    this.context.pop()
  else
    this.context.push(types.q_tmpl)
  this.exprAllowed = false
}

tt.star.updateContext = function(prevType) {
  if (prevType == tt._function) {
    let index = this.context.length - 1
    if (this.context[index] === types.f_expr)
      this.context[index] = types.f_expr_gen
    else
      this.context[index] = types.f_gen
  }
  this.exprAllowed = true
}

tt.name.updateContext = function(prevType) {
  let allowed = false
  if (this.options.ecmaVersion >= 6) {
    if (this.value == "of" && !this.exprAllowed ||
        this.value == "yield" && this.inGeneratorContext())
      allowed = true
  }
  this.exprAllowed = allowed
}
