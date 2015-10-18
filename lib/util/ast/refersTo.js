import areRefsTrackable from './areRefsTrackable'
import hasContext from './hasContext'

export default function refersTo (resolved, isContext) {
  const refs = resolved && resolved.references
  if (!areRefsTrackable(refs)) {
    return false
  }

  const refersToMethodContext = hasContext(resolved.scope, isContext)
  return refersToMethodContext
}
