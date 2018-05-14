import {isIdentifierStart, isIdentifierChar} from "./identifier.js"
import {Parser} from "./state.js"
import UNICODE_PROPERTY_VALUES from "./unicode-property-data.js"

const pp = Parser.prototype

export class RegExpValidationState {
  constructor(parser) {
    this.parser = parser
    this.validFlags = `gim${parser.options.ecmaVersion >= 6 ? "uy" : ""}${parser.options.ecmaVersion >= 9 ? "s" : ""}`
    this.source = ""
    this.flags = ""
    this.start = 0
    this.switchU = false
    this.switchN = false
    this.pos = 0
    this.lastIntValue = 0
    this.lastStringValue = ""
    this.lastAssertionIsQuantifiable = false
    this.numCapturingParens = 0
    this.maxBackReference = 0
    this.groupNames = []
    this.backReferenceNames = []
  }

  reset(start, pattern, flags) {
    const unicode = flags.indexOf("u") !== -1
    this.start = start | 0
    this.source = pattern + ""
    this.flags = flags
    this.switchU = unicode && this.parser.options.ecmaVersion >= 6
    this.switchN = unicode && this.parser.options.ecmaVersion >= 9
  }

  raise(message) {
    this.parser.raiseRecoverable(this.start, `Invalid regular expression: /${this.source}/: ${message}`)
  }

  // If u flag is given, this returns the code point at the index (it combines a surrogate pair).
  // Otherwise, this returns the code unit of the index (can be a part of a surrogate pair).
  at(i) {
    const s = this.source
    const l = s.length
    if (i >= l) {
      return -1
    }
    const c = s.charCodeAt(i)
    if (!this.switchU || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l) {
      return c
    }
    return (c << 10) + s.charCodeAt(i + 1) - 0x35FDC00
  }

  nextIndex(i) {
    const s = this.source
    const l = s.length
    if (i >= l) {
      return l
    }
    const c = s.charCodeAt(i)
    if (!this.switchU || c <= 0xD7FF || c >= 0xE000 || i + 1 >= l) {
      return i + 1
    }
    return i + 2
  }

  current() {
    return this.at(this.pos)
  }

  lookahead() {
    return this.at(this.nextIndex(this.pos))
  }

  advance() {
    this.pos = this.nextIndex(this.pos)
  }

  eat(ch) {
    if (this.current() === ch) {
      this.advance()
      return true
    }
    return false
  }
}

function codePointToString(ch) {
  if (ch <= 0xFFFF) return String.fromCharCode(ch)
  ch -= 0x10000
  return String.fromCharCode((ch >> 10) + 0xD800, (ch & 0x03FF) + 0xDC00)
}

/**
 * Validate the flags part of a given RegExpLiteral.
 *
 * @param {RegExpValidationState} state The state to validate RegExp.
 * @returns {void}
 */
pp.validateRegExpFlags = function(state) {
  const validFlags = state.validFlags
  const flags = state.flags

  for (let i = 0; i < flags.length; i++) {
    const flag = flags.charAt(i)
    if (validFlags.indexOf(flag) == -1) {
      this.raise(state.start, "Invalid regular expression flag")
    }
    if (flags.indexOf(flag, i + 1) > -1) {
      this.raise(state.start, "Duplicate regular expression flag")
    }
  }
}

/**
 * Validate the pattern part of a given RegExpLiteral.
 *
 * @param {RegExpValidationState} state The state to validate RegExp.
 * @returns {void}
 */
pp.validateRegExpPattern = function(state) {
  this.regexp_pattern(state)

  // The goal symbol for the parse is |Pattern[~U, ~N]|. If the result of
  // parsing contains a |GroupName|, reparse with the goal symbol
  // |Pattern[~U, +N]| and use this result instead. Throw a *SyntaxError*
  // exception if _P_ did not conform to the grammar, if any elements of _P_
  // were not matched by the parse, or if any Early Error conditions exist.
  if (!state.switchN && this.options.ecmaVersion >= 9 && state.groupNames.length > 0) {
    state.switchN = true
    this.regexp_pattern(state)
  }
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-Pattern
pp.regexp_pattern = function(state) {
  state.pos = 0
  state.lastIntValue = 0
  state.lastStringValue = ""
  state.lastAssertionIsQuantifiable = false
  state.numCapturingParens = 0
  state.maxBackReference = 0
  state.groupNames.length = 0
  state.backReferenceNames.length = 0

  this.regexp_disjunction(state)

  if (state.pos !== state.source.length) {
    // Make the same messages as V8.
    if (state.eat(0x29 /* ) */)) {
      state.raise("Unmatched ')'")
    }
    if (state.eat(0x5D /* [ */) || state.eat(0x7D /* } */)) {
      state.raise("Lone quantifier brackets")
    }
  }
  if (state.maxBackReference > state.numCapturingParens) {
    state.raise("Invalid escape")
  }
  for (const name of state.backReferenceNames) {
    if (state.groupNames.indexOf(name) === -1) {
      state.raise("Invalid named capture referenced")
    }
  }
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-Disjunction
pp.regexp_disjunction = function(state) {
  this.regexp_alternative(state)
  while (state.eat(0x7C /* | */)) {
    this.regexp_alternative(state)
  }

  // Make the same message as V8.
  if (this.regexp_eatQuantifier(state, true)) {
    state.raise("Nothing to repeat")
  }
  if (state.eat(0x7B /* { */)) {
    state.raise("Lone quantifier brackets")
  }
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-Alternative
pp.regexp_alternative = function(state) {
  while (state.pos < state.source.length && this.regexp_eatTerm(state))
    ;
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-Term
pp.regexp_eatTerm = function(state) {
  if (this.regexp_eatAssertion(state)) {
    // Handle `QuantifiableAssertion Quantifier` alternative.
    // `state.lastAssertionIsQuantifiable` is true if the last eaten Assertion
    // is a QuantifiableAssertion.
    if (state.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state)) {
      // Make the same message as V8.
      if (state.switchU) {
        state.raise("Invalid quantifier")
      }
    }
    return true
  }

  if (state.switchU ? this.regexp_eatAtom(state) : this.regexp_eatExtendedAtom(state)) {
    this.regexp_eatQuantifier(state)
    return true
  }

  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-Assertion
pp.regexp_eatAssertion = function(state) {
  const start = state.pos
  state.lastAssertionIsQuantifiable = false

  // ^, $
  if (state.eat(0x5E /* ^ */) || state.eat(0x24 /* $ */)) {
    return true
  }

  // \b \B
  if (state.eat(0x5C /* \ */)) {
    if (state.eat(0x42 /* B */) || state.eat(0x62 /* b */)) {
      return true
    }
    state.pos = start
  }

  // Lookahead / Lookbehind
  if (state.eat(0x28 /* ( */) && state.eat(0x3F /* ? */)) {
    let lookbehind = false
    if (this.options.ecmaVersion >= 9) {
      lookbehind = state.eat(0x3C /* < */)
    }
    if (state.eat(0x3D /* = */) || state.eat(0x21 /* ! */)) {
      this.regexp_disjunction(state)
      if (!state.eat(0x29 /* ) */)) {
        state.raise("Unterminated group")
      }
      state.lastAssertionIsQuantifiable = !lookbehind
      return true
    }
  }

  state.pos = start
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-Quantifier
pp.regexp_eatQuantifier = function(state, noError = false) {
  if (this.regexp_eatQuantifierPrefix(state, noError)) {
    state.eat(0x3F /* ? */)
    return true
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-QuantifierPrefix
pp.regexp_eatQuantifierPrefix = function(state, noError) {
  return (
    state.eat(0x2A /* * */) ||
    state.eat(0x2B /* + */) ||
    state.eat(0x3F /* ? */) ||
    this.regexp_eatBracedQuantifier(state, noError)
  )
}
pp.regexp_eatBracedQuantifier = function(state, noError) {
  const start = state.pos
  if (state.eat(0x7B /* { */)) {
    let min = 0, max = -1
    if (this.regexp_eatDecimalDigits(state)) {
      min = state.lastIntValue
      if (state.eat(0x2C /* , */) && this.regexp_eatDecimalDigits(state)) {
        max = state.lastIntValue
      }
      if (state.eat(0x7D /* } */)) {
        // SyntaxError in https://www.ecma-international.org/ecma-262/8.0/#sec-term
        if (max !== -1 && max < min && !noError) {
          state.raise("numbers out of order in {} quantifier")
        }
        return true
      }
    }
    if (state.switchU && !noError) {
      state.raise("Incomplete quantifier")
    }
    state.pos = start
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-Atom
pp.regexp_eatAtom = function(state) {
  return (
    this.regexp_eatPatternCharacters(state) ||
    state.eat(0x2E /* . */) ||
    this.regexp_eatReverseSolidusAtomEscape(state) ||
    this.regexp_eatCharacterClass(state) ||
    this.regexp_eatUncapturingGroup(state) ||
    this.regexp_eatCapturingGroup(state)
  )
}
pp.regexp_eatReverseSolidusAtomEscape = function(state) {
  const start = state.pos
  if (state.eat(0x5C /* \ */)) {
    if (this.regexp_eatAtomEscape(state)) {
      return true
    }
    state.pos = start
  }
  return false
}
pp.regexp_eatUncapturingGroup = function(state) {
  const start = state.pos
  if (state.eat(0x28 /* ( */)) {
    if (state.eat(0x3F /* ? */) && state.eat(0x3A /* : */)) {
      this.regexp_disjunction(state)
      if (state.eat(0x29 /* ) */)) {
        return true
      }
      state.raise("Unterminated group")
    }
    state.pos = start
  }
  return false
}
pp.regexp_eatCapturingGroup = function(state) {
  if (state.eat(0x28 /* ( */)) {
    if (this.options.ecmaVersion >= 9) {
      this.regexp_groupSpecifier(state)
    } else if (state.current() === 0x3F /* ? */) {
      state.raise("Invalid group")
    }
    this.regexp_disjunction(state)
    if (state.eat(0x29 /* ) */)) {
      state.numCapturingParens += 1
      return true
    }
    state.raise("Unterminated group")
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ExtendedAtom
pp.regexp_eatExtendedAtom = function(state) {
  return (
    state.eat(0x2E /* . */) ||
    this.regexp_eatReverseSolidusAtomEscape(state) ||
    this.regexp_eatCharacterClass(state) ||
    this.regexp_eatUncapturingGroup(state) ||
    this.regexp_eatCapturingGroup(state) ||
    this.regexp_eatInvalidBracedQuantifier(state) ||
    this.regexp_eatExtendedPatternCharacter(state)
  )
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-InvalidBracedQuantifier
pp.regexp_eatInvalidBracedQuantifier = function(state) {
  if (this.regexp_eatBracedQuantifier(state, true)) {
    state.raise("Nothing to repeat")
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-SyntaxCharacter
pp.regexp_eatSyntaxCharacter = function(state) {
  const ch = state.current()
  if (isSyntaxCharacter(ch)) {
    state.lastIntValue = ch
    state.advance()
    return true
  }
  return false
}
function isSyntaxCharacter(ch) {
  return (
    ch === 0x24 /* $ */ ||
    ch >= 0x28 /* ( */ && ch <= 0x2B /* + */ ||
    ch === 0x2E /* . */ ||
    ch === 0x3F /* ? */ ||
    ch >= 0x5B /* [ */ && ch <= 0x5E /* ^ */ ||
    ch >= 0x7B /* { */ && ch <= 0x7D /* } */
  )
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-PatternCharacter
// But eat eager.
pp.regexp_eatPatternCharacters = function(state) {
  const start = state.pos
  let ch = 0
  while ((ch = state.current()) !== -1 && !isSyntaxCharacter(ch)) {
    state.advance()
  }
  return state.pos !== start
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ExtendedPatternCharacter
pp.regexp_eatExtendedPatternCharacter = function(state) {
  const ch = state.current()
  if (
    ch !== -1 &&
    ch !== 0x24 /* $ */ &&
    !(ch >= 0x28 /* ( */ && ch <= 0x2B /* + */) &&
    ch !== 0x2E /* . */ &&
    ch !== 0x3F /* ? */ &&
    ch !== 0x5B /* [ */ &&
    ch !== 0x5E /* ^ */ &&
    ch !== 0x7C /* | */
  ) {
    state.advance()
    return true
  }
  return false
}

// GroupSpecifier[U] ::
//   [empty]
//   `?` GroupName[?U]
pp.regexp_groupSpecifier = function(state) {
  if (state.eat(0x3F /* ? */)) {
    if (this.regexp_eatGroupName(state)) {
      if (state.groupNames.indexOf(state.lastStringValue) !== -1) {
        state.raise("Duplicate capture group name")
      }
      state.groupNames.push(state.lastStringValue)
      return
    }
    state.raise("Invalid group")
  }
}

// GroupName[U] ::
//   `<` RegExpIdentifierName[?U] `>`
// Note: this updates `state.lastStringValue` property with the eaten name.
pp.regexp_eatGroupName = function(state) {
  state.lastStringValue = ""
  if (state.eat(0x3C /* < */)) {
    if (this.regexp_eatRegExpIdentifierName(state) && state.eat(0x3E /* > */)) {
      return true
    }
    state.raise("Invalid capture group name")
  }
  return false
}

// RegExpIdentifierName[U] ::
//   RegExpIdentifierStart[?U]
//   RegExpIdentifierName[?U] RegExpIdentifierPart[?U]
// Note: this updates `state.lastStringValue` property with the eaten name.
pp.regexp_eatRegExpIdentifierName = function(state) {
  state.lastStringValue = ""
  if (this.regexp_eatRegExpIdentifierStart(state)) {
    state.lastStringValue += codePointToString(state.lastIntValue)
    while (this.regexp_eatRegExpIdentifierPart(state)) {
      state.lastStringValue += codePointToString(state.lastIntValue)
    }
    return true
  }
  return false
}

// RegExpIdentifierStart[U] ::
//   UnicodeIDStart
//   `$`
//   `_`
//   `\` RegExpUnicodeEscapeSequence[?U]
pp.regexp_eatRegExpIdentifierStart = function(state) {
  const start = state.pos
  let ch = state.current()
  state.advance()

  if (ch === 0x5C /* \ */ && this.regexp_eatRegExpUnicodeEscapeSequence(state)) {
    ch = state.lastIntValue
  }
  if (isRegExpIdentifierStart(ch)) {
    state.lastIntValue = ch
    return true
  }

  state.pos = start
  return false
}
function isRegExpIdentifierStart(ch) {
  return isIdentifierStart(ch, true) || ch === 0x24 /* $ */ || ch === 0x5F /* _ */
}

// RegExpIdentifierPart[U] ::
//   UnicodeIDContinue
//   `$`
//   `_`
//   `\` RegExpUnicodeEscapeSequence[?U]
//   <ZWNJ>
//   <ZWJ>
pp.regexp_eatRegExpIdentifierPart = function(state) {
  const start = state.pos
  let ch = state.current()
  state.advance()

  if (ch === 0x5C /* \ */ && this.regexp_eatRegExpUnicodeEscapeSequence(state)) {
    ch = state.lastIntValue
  }
  if (isRegExpIdentifierPart(ch)) {
    state.lastIntValue = ch
    return true
  }

  state.pos = start
  return false
}
function isRegExpIdentifierPart(ch) {
  return isIdentifierChar(ch, true) || ch === 0x24 /* $ */ || ch === 0x5F /* _ */ || ch === 0x200C /* <ZWNJ> */ || ch === 0x200D /* <ZWJ> */
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-AtomEscape
pp.regexp_eatAtomEscape = function(state) {
  if (
    this.regexp_eatBackReference(state) ||
    this.regexp_eatCharacterClassEscape(state) ||
    this.regexp_eatCharacterEscape(state) ||
    (state.switchN && this.regexp_eatKGroupName(state))
  ) {
    return true
  }
  if (state.switchU) {
    // Make the same message as V8.
    if (state.current() === 0x63 /* c */) {
      state.raise("Invalid unicode escape")
    }
    state.raise("Invalid escape")
  }
  return false
}
pp.regexp_eatBackReference = function(state) {
  const start = state.pos
  if (this.regexp_eatDecimalEscape(state)) {
    const n = state.lastIntValue
    if (state.switchU) {
      // For SyntaxError in https://www.ecma-international.org/ecma-262/8.0/#sec-atomescape
      if (n > state.maxBackReference) {
        state.maxBackReference = n
      }
      return true
    }
    if (n <= state.numCapturingParens) {
      return true
    }
    state.pos = start
  }
  return false
}
pp.regexp_eatKGroupName = function(state) {
  if (state.eat(0x6B /* k */)) {
    if (this.regexp_eatGroupName(state)) {
      state.backReferenceNames.push(state.lastStringValue)
      return true
    }
    state.raise("Invalid named reference")
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-CharacterEscape
pp.regexp_eatCharacterEscape = function(state) {
  return (
    this.regexp_eatControlEscape(state) ||
    this.regexp_eatCControlLetter(state) ||
    this.regexp_eatZero(state) ||
    this.regexp_eatHexEscapeSequence(state) ||
    this.regexp_eatRegExpUnicodeEscapeSequence(state) ||
    (!state.switchU && this.regexp_eatLegacyOctalEscapeSequence(state)) ||
    this.regexp_eatIdentityEscape(state)
  )
}
pp.regexp_eatCControlLetter = function(state) {
  const start = state.pos
  if (state.eat(0x63 /* c */)) {
    if (this.regexp_eatControlLetter(state)) {
      return true
    }
    state.pos = start
  }
  return false
}
pp.regexp_eatZero = function(state) {
  if (state.current() === 0x30 /* 0 */ && !isDecimalDigit(state.lookahead())) {
    state.lastIntValue = 0
    state.advance()
    return true
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-ControlEscape
pp.regexp_eatControlEscape = function(state) {
  const ch = state.current()
  if (ch === 0x74 /* t */) {
    state.lastIntValue = 0x09 /* \t */
    state.advance()
    return true
  }
  if (ch === 0x6E /* n */) {
    state.lastIntValue = 0x0A /* \n */
    state.advance()
    return true
  }
  if (ch === 0x76 /* v */) {
    state.lastIntValue = 0x0B /* \v */
    state.advance()
    return true
  }
  if (ch === 0x66 /* f */) {
    state.lastIntValue = 0x0C /* \f */
    state.advance()
    return true
  }
  if (ch === 0x72 /* r */) {
    state.lastIntValue = 0x0D /* \r */
    state.advance()
    return true
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-ControlLetter
pp.regexp_eatControlLetter = function(state) {
  const ch = state.current()
  if (isControlLetter(ch)) {
    state.lastIntValue = ch % 0x20
    state.advance()
    return true
  }
  return false
}
function isControlLetter(ch) {
  return (
    (ch >= 0x41 /* A */ && ch <= 0x5A /* Z */) ||
    (ch >= 0x61 /* a */ && ch <= 0x7A /* z */)
  )
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-RegExpUnicodeEscapeSequence
pp.regexp_eatRegExpUnicodeEscapeSequence = function(state) {
  const start = state.pos

  if (state.eat(0x75 /* u */)) {
    if (this.regexp_eatFixedHexDigits(state, 4)) {
      const lead = state.lastIntValue
      if (state.switchU && lead >= 0xD800 && lead <= 0xDBFF) {
        const leadSurrogateEnd = state.pos
        if (state.eat(0x5C /* \ */) && state.eat(0x75 /* u */) && this.regexp_eatFixedHexDigits(state, 4)) {
          const trail = state.lastIntValue
          if (trail >= 0xDC00 && trail <= 0xDFFF) {
            state.lastIntValue = (lead - 0xD800) * 0x400 + (trail - 0xDC00) + 0x10000
            return true
          }
        }
        state.pos = leadSurrogateEnd
        state.lastIntValue = lead
      }
      return true
    }
    if (
      state.switchU &&
      state.eat(0x7B /* { */) &&
      this.regexp_eatHexDigits(state) &&
      state.eat(0x7D /* } */) &&
      isValidUnicode(state.lastIntValue)
    ) {
      return true
    }
    if (state.switchU) {
      state.raise("Invalid unicode escape")
    }
    state.pos = start
  }

  return false
}
function isValidUnicode(ch) {
  return ch >= 0 && ch <= 0x10FFFF
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-IdentityEscape
pp.regexp_eatIdentityEscape = function(state) {
  if (state.switchU) {
    if (this.regexp_eatSyntaxCharacter(state)) {
      return true
    }
    if (state.eat(0x2F /* / */)) {
      state.lastIntValue = 0x2F /* / */
      return true
    }
    return false
  }

  const ch = state.current()
  if (ch !== 0x63 /* c */ && (!state.switchN || ch !== 0x6B /* k */)) {
    state.lastIntValue = ch
    state.advance()
    return true
  }

  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-DecimalEscape
pp.regexp_eatDecimalEscape = function(state) {
  state.lastIntValue = 0
  let ch = state.current()
  if (ch >= 0x31 /* 1 */ && ch <= 0x39 /* 9 */) {
    do {
      state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 /* 0 */)
      state.advance()
    } while ((ch = state.current()) >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */)
    return true
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-CharacterClassEscape
pp.regexp_eatCharacterClassEscape = function(state) {
  const ch = state.current()

  if (isCharacterClassEscape(ch)) {
    state.lastIntValue = -1
    state.advance()
    return true
  }

  if (
    state.switchU &&
    this.options.ecmaVersion >= 9 &&
    (ch === 0x50 /* P */ || ch === 0x70 /* p */)
  ) {
    state.lastIntValue = -1
    state.advance()
    if (
      state.eat(0x7B /* { */) &&
      this.regexp_eatUnicodePropertyValueExpression(state) &&
      state.eat(0x7D /* } */)
    ) {
      return true
    }
    state.raise("Invalid property name")
  }

  return false
}
function isCharacterClassEscape(ch) {
  return (
    ch === 0x64 /* d */ ||
    ch === 0x44 /* D */ ||
    ch === 0x73 /* s */ ||
    ch === 0x53 /* S */ ||
    ch === 0x77 /* w */ ||
    ch === 0x57 /* W */
  )
}

// UnicodePropertyValueExpression ::
//   UnicodePropertyName `=` UnicodePropertyValue
//   LoneUnicodePropertyNameOrValue
pp.regexp_eatUnicodePropertyValueExpression = function(state) {
  const start = state.pos

  // UnicodePropertyName `=` UnicodePropertyValue
  if (this.regexp_eatUnicodePropertyName(state) && state.eat(0x3D /* = */)) {
    const name = state.lastStringValue
    if (this.regexp_eatUnicodePropertyValue(state)) {
      const value = state.lastStringValue
      this.regexp_validateUnicodePropertyNameAndValue(state, name, value)
      return true
    }
  }
  state.pos = start

  // LoneUnicodePropertyNameOrValue
  if (this.regexp_eatLoneUnicodePropertyNameOrValue(state)) {
    const nameOrValue = state.lastStringValue
    this.regexp_validateUnicodePropertyNameOrValue(state, nameOrValue)
    return true
  }
  return false
}
pp.regexp_validateUnicodePropertyNameAndValue = function(state, name, value) {
  if (!UNICODE_PROPERTY_VALUES.hasOwnProperty(name) || UNICODE_PROPERTY_VALUES[name].indexOf(value) === -1) {
    state.raise("Invalid property name")
  }
}
pp.regexp_validateUnicodePropertyNameOrValue = function(state, nameOrValue) {
  if (UNICODE_PROPERTY_VALUES.$LONE.indexOf(nameOrValue) === -1) {
    state.raise("Invalid property name")
  }
}

// UnicodePropertyName ::
//   UnicodePropertyNameCharacters
pp.regexp_eatUnicodePropertyName = function(state) {
  let ch = 0
  state.lastStringValue = ""
  while (isUnicodePropertyNameCharacter(ch = state.current())) {
    state.lastStringValue += codePointToString(ch)
    state.advance()
  }
  return state.lastStringValue !== ""
}
function isUnicodePropertyNameCharacter(ch) {
  return isControlLetter(ch) || ch === 0x5F /* _ */
}

// UnicodePropertyValue ::
//   UnicodePropertyValueCharacters
pp.regexp_eatUnicodePropertyValue = function(state) {
  let ch = 0
  state.lastStringValue = ""
  while (isUnicodePropertyValueCharacter(ch = state.current())) {
    state.lastStringValue += codePointToString(ch)
    state.advance()
  }
  return state.lastStringValue !== ""
}
function isUnicodePropertyValueCharacter(ch) {
  return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch)
}

// LoneUnicodePropertyNameOrValue ::
//   UnicodePropertyValueCharacters
pp.regexp_eatLoneUnicodePropertyNameOrValue = function(state) {
  return this.regexp_eatUnicodePropertyValue(state)
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-CharacterClass
pp.regexp_eatCharacterClass = function(state) {
  if (state.eat(0x5B /* [ */)) {
    state.eat(0x5E /* ^ */)
    this.regexp_classRanges(state)
    if (state.eat(0x5D /* [ */)) {
      return true
    }
    // Unreachable since it threw "unterminated regular expression" error before.
    state.raise("Unterminated character class")
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-ClassRanges
// https://www.ecma-international.org/ecma-262/8.0/#prod-NonemptyClassRanges
// https://www.ecma-international.org/ecma-262/8.0/#prod-NonemptyClassRangesNoDash
pp.regexp_classRanges = function(state) {
  while (this.regexp_eatClassAtom(state)) {
    const left = state.lastIntValue
    if (state.eat(0x2D /* - */) && this.regexp_eatClassAtom(state)) {
      const right = state.lastIntValue
      if (state.switchU && (left === -1 || right === -1)) {
        state.raise("Invalid character class")
      }
      if (left !== -1 && right !== -1 && left > right) {
        state.raise("Range out of order in character class")
      }
    }
  }
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-ClassAtom
// https://www.ecma-international.org/ecma-262/8.0/#prod-ClassAtomNoDash
pp.regexp_eatClassAtom = function(state) {
  const start = state.pos

  if (state.eat(0x5C /* \ */)) {
    if (this.regexp_eatClassEscape(state)) {
      return true
    }
    if (state.switchU) {
      // Make the same message as V8.
      const ch = state.current()
      if (ch === 0x63 /* c */ || isOctalDigit(ch)) {
        state.raise("Invalid class escape")
      }
      state.raise("Invalid escape")
    }
    state.pos = start
  }

  const ch = state.current()
  if (ch !== 0x5D /* [ */) {
    state.lastIntValue = ch
    state.advance()
    return true
  }

  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ClassEscape
pp.regexp_eatClassEscape = function(state) {
  const start = state.pos

  if (state.eat(0x62 /* b */)) {
    state.lastIntValue = 0x08 /* <BS> */
    return true
  }

  if (state.switchU && state.eat(0x2D /* - */)) {
    state.lastIntValue = 0x2D /* - */
    return true
  }

  if (!state.switchU && state.eat(0x63 /* c */)) {
    if (this.regexp_eatClassControlLetter(state)) {
      return true
    }
    state.pos = start
  }

  return (
    this.regexp_eatCharacterClassEscape(state) ||
    this.regexp_eatCharacterEscape(state)
  )
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-ClassControlLetter
pp.regexp_eatClassControlLetter = function(state) {
  const ch = state.current()
  if (isDecimalDigit(ch) || ch === 0x5F /* _ */) {
    state.lastIntValue = ch % 0x20
    state.advance()
    return true
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-HexEscapeSequence
pp.regexp_eatHexEscapeSequence = function(state) {
  const start = state.pos
  if (state.eat(0x78 /* x */)) {
    if (this.regexp_eatFixedHexDigits(state, 2)) {
      return true
    }
    if (state.switchU) {
      state.raise("Invalid escape")
    }
    state.pos = start
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-DecimalDigits
pp.regexp_eatDecimalDigits = function(state) {
  const start = state.pos
  let ch = 0
  state.lastIntValue = 0
  while (isDecimalDigit(ch = state.current())) {
    state.lastIntValue = 10 * state.lastIntValue + (ch - 0x30 /* 0 */)
    state.advance()
  }
  return state.pos !== start
}
function isDecimalDigit(ch) {
  return ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-HexDigits
pp.regexp_eatHexDigits = function(state) {
  const start = state.pos
  let ch = 0
  state.lastIntValue = 0
  while (isHexDigit(ch = state.current())) {
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch)
    state.advance()
  }
  return state.pos !== start
}
function isHexDigit(ch) {
  return (
    (ch >= 0x30 /* 0 */ && ch <= 0x39 /* 9 */) ||
    (ch >= 0x41 /* A */ && ch <= 0x46 /* F */) ||
    (ch >= 0x61 /* a */ && ch <= 0x66 /* f */)
  )
}
function hexToInt(ch) {
  if (ch >= 0x41 /* A */ && ch <= 0x46 /* F */) {
    return 10 + (ch - 0x41 /* A */)
  }
  if (ch >= 0x61 /* a */ && ch <= 0x66 /* f */) {
    return 10 + (ch - 0x61 /* a */)
  }
  return ch - 0x30 /* 0 */
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-annexB-LegacyOctalEscapeSequence
// Allows only 0-377(octal) i.e. 0-255(decimal).
pp.regexp_eatLegacyOctalEscapeSequence = function(state) {
  if (this.regexp_eatOctalDigit(state)) {
    const n1 = state.lastIntValue
    if (this.regexp_eatOctalDigit(state)) {
      const n2 = state.lastIntValue
      if (n1 <= 3 && this.regexp_eatOctalDigit(state)) {
        state.lastIntValue = n1 * 64 + n2 * 8 + state.lastIntValue
      } else {
        state.lastIntValue = n1 * 8 + n2
      }
    } else {
      state.lastIntValue = n1
    }
    return true
  }
  return false
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-OctalDigit
pp.regexp_eatOctalDigit = function(state) {
  const ch = state.current()
  if (isOctalDigit(ch)) {
    state.lastIntValue = ch - 0x30 /* 0 */
    state.advance()
    return true
  }
  state.lastIntValue = 0
  return false
}
function isOctalDigit(ch) {
  return ch >= 0x30 /* 0 */ && ch <= 0x37 /* 7 */
}

// https://www.ecma-international.org/ecma-262/8.0/#prod-Hex4Digits
// https://www.ecma-international.org/ecma-262/8.0/#prod-HexDigit
// And HexDigit HexDigit in https://www.ecma-international.org/ecma-262/8.0/#prod-HexEscapeSequence
pp.regexp_eatFixedHexDigits = function(state, length) {
  const start = state.pos
  state.lastIntValue = 0
  for (let i = 0; i < length; ++i) {
    const ch = state.current()
    if (!isHexDigit(ch)) {
      state.pos = start
      return false
    }
    state.lastIntValue = 16 * state.lastIntValue + hexToInt(ch)
    state.advance()
  }
  return true
}
