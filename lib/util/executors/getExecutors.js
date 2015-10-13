import filterExecutorsByAncestors from './filterExecutorsByAncestors'
import getExecutorsByEnv from './getExecutorsByEnv'

// ENVIRONMENT -> Nodes -> Set
export default function getExecutors (env, ancestors) {
  return filterExecutorsByAncestors(
    getExecutorsByEnv(env),
    ancestors
  )
}
