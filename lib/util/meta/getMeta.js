import getMeteorMeta from './getMeteorMeta'
import getEnvFromComments from './getEnvFromComments'
import getRelativePath from './getRelativePath'
import memoize from 'lodash.memoize'

const memoizedGetMeteorMeta = memoize(getMeteorMeta)
const memoizedGetRelativePath = memoize(getRelativePath)

export default function getMeta (context) {
  const filename = context && context.getFilename()
  const meta = memoizedGetMeteorMeta(memoizedGetRelativePath(filename))

  const envFromComments = getEnvFromComments(context.getSourceCode().getAllComments())
  if (envFromComments) {
    meta.env = envFromComments
  }

  return meta
}
