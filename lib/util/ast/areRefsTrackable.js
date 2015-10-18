
/*
  Determines whether the value of a variables can be safely assumed or not.
  The variable must be written to exactly once.
 */
export default function areRefsTrackable (refs) {
  if (!refs || refs.length === 0) {
    return false
  }

  // must be assigned to `this` on declaration
  const assignment = refs[0]
  if (!assignment.writeExpr || assignment.writeExpr.type !== 'ThisExpression') {
    return false
  }

  // may not be re-assigned
  if (refs.filter(ref => ref.writeExpr).length !== 1) {
    return false
  }
  return true
}
