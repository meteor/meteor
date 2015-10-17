import filterExecutorsByAncestors from './filterExecutorsByAncestors'
import getExecutorsFromComments from './getExecutorsFromComments'
import getExecutorsByEnv from './getExecutorsByEnv'

// ENVIRONMENT -> Context -> Set
export default function getExecutors (env, context) {

  const comments = context.getSourceCode().getAllComments()
  const executorsFromComments = getExecutorsFromComments(comments)

  // executors from comments overwrite executors determined by file location
  let executors = executorsFromComments.size > 0 ? executorsFromComments : getExecutorsByEnv(env)

  return filterExecutorsByAncestors(executors, context.getAncestors())
}
