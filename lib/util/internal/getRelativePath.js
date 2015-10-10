import stripPathPrefix from './stripPathPrefix'
const getRootPath = require('./getRootPath')

export default function (filename) {
  return stripPathPrefix(getRootPath(filename), filename)
}
