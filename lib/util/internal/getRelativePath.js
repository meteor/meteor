import stripPathPrefix from './stripPathPrefix'
const getRootPath = require('./getRootPath')

export default function (filename) {
  const rootPath = getRootPath(filename)
  if (!rootPath) {
    return false
  }
  return stripPathPrefix(rootPath, filename)
}
