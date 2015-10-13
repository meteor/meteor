import invariant from 'invariant'
import isMeteorBlockOnlyTest from './isMeteorBlockOnlyTest'
import getExecutorsFromTest from './getExecutorsFromTest'
import {intersection, difference} from './sets'

// Set -> Array -> Set
export default function filterExecutorsByAncestors (originalExecutors, ancestors) {

  let executors = new Set([...originalExecutors])

  for (let i = ancestors.length - 1; i > 0; i--) {
    const current = ancestors[i]
    const parent = ancestors[i - 1]
    if (parent.type === 'IfStatement') {
      if (isMeteorBlockOnlyTest(parent.test)) {
        const executorsFromTest = getExecutorsFromTest(parent.test)
        if (parent.consequent === current) {
          executors = intersection(executors, executorsFromTest)
        } else if (parent.alternate === current) {
          executors = difference(executors, executorsFromTest)
        } else {
          invariant(false, 'Block is neither consequent nor alternate of parent')
        }
      } else {

        // can not determine executors, because of unresolvable if-statement
        return new Set()
      }
    }
  }

  return executors
}
