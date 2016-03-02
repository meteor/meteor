import filterExecutorsByAncestors from './filterExecutorsByAncestors'
import getExecutorsByEnv from './getExecutorsByEnv'

// ENVIRONMENT -> Context -> Set
export default function getExecutors(env, ancestors) {
  return filterExecutorsByAncestors(getExecutorsByEnv(env), ancestors)
}
