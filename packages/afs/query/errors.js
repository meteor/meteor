/**
 * Errors thrown by afs's query subsystem.
 */

/**
 * Thrown by parse* functions when the input is not a well-formed
 * MongoDB-style selector/modifier/sort/projection.
 */
export class ParseError extends Error {
  constructor(message, rawInput) {
    super(message);
    this.name = 'ParseError';
    this.code = 'parse-error';
    this.rawInput = rawInput;
  }
}

/**
 * Thrown by adapter walkers (e.g. postgres' SQL compiler) when an AST
 * node-type or predicate-kind is outside the adapter's declared
 * capabilities. afs's `walkSelector` / `walkModifier` raise this when a
 * visitor object lacks a handler for an encountered node type.
 */
export class UnsupportedOperatorError extends Error {
  constructor(message, { nodeType, adapterName } = {}) {
    super(message);
    this.name = 'UnsupportedOperatorError';
    this.code = 'unsupported-operator';
    this.nodeType = nodeType;
    this.adapterName = adapterName;
  }
}
