import path from 'path'
import invariant from 'invariant'

export default function stripPathPrefix (parent, child) {
  const normalizedParent = path.normalize(parent)
  const normalizedChild = path.normalize(child)

  invariant(
    normalizedChild.substr(0, normalizedParent.length) === parent,
    'Linted file is not in parent'
  )

  // also strip the / at the end, which is not in normalizedParent
  return normalizedChild.substr(normalizedParent.length + 1)
}
