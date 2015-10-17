import stripPathPrefix from './stripPathPrefix'
const getRootPath = require('./getRootPath')

export default function (filename) {
  // '<input>' is ESLint's default filename when the real one is not known
  if (filename === '<input>') {
    return false
  }

  const rootPath = getRootPath(filename)

  if (!rootPath) {
    return false
  }
  return stripPathPrefix(rootPath, filename)
}
