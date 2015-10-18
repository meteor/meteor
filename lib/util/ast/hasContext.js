function getUpperScopes (scope, cur = []) {
  if (!scope.upper) {
    return cur
  }
  return getUpperScopes(scope.upper, [...cur, scope.upper])
}

/*
  List of scope types that change the context implicitly.

  https://github.com/estools/escope/blob/master/src/scope.js
  All possible scope types are:
    - TDZ
    - module
    - block
    - switch
    - function
    - catch
    - with
    - function
    - class
    - global
 */
const contextChangingScopeTypes = new Set(['class', 'function'])

/**
 * Takes a scope and searches it and its ancestors for a special context.
 * If it finds a scope changing the context, it will stop the search as there is
 * no way "this" will refer to that context then.
 * @param {[Scope]} scope The scope to start the search at
 * @return {Boolean} true if the context refers to a publication function
 */
export default function hasContext (scope, comparator) {
  const scopes = [scope, ...getUpperScopes(scope)]
  let continueSearch = true
  return scopes.reduce((prev, currentScope) => {
    if (!continueSearch) {
      return prev
    }
    if (comparator(currentScope)) {
      continueSearch = false
      return true
    } else if (

      // scope changes context, "this" no longer refers to publication
      contextChangingScopeTypes.has(currentScope.type) &&
      (!currentScope.block || currentScope.block.type !== 'ArrowFunctionExpression')
    ) {
      continueSearch = false
    }
    return false
  }, false)
}
