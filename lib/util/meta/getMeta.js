import path from 'path'
import getMeteorMeta from './getMeteorMeta'
import getEnvFromComments from './getEnvFromComments'
import getRelativePath from './getRelativePath'
import memoize from 'lodash.memoize'

const memoizedGetMeteorMeta = memoize(getMeteorMeta)
const memoizedGetRelativePath = memoize(getRelativePath)

export default function getMeta (context) {
  const filename = context && context.getFilename()

  let normalizedFilename = filename

  // Received a relative path. This is probably from SublimeLinter
  if (filename[0] !== path.sep && filename !== '<input>') {
    normalizedFilename = path.join(process.cwd(), path.basename(filename))
  }

  const meta = memoizedGetMeteorMeta(memoizedGetRelativePath(normalizedFilename))

  const envFromComments = getEnvFromComments(context.getSourceCode().getAllComments())
  if (envFromComments) {
    meta.env = envFromComments
  }

  return meta
}
