import stripPathPrefix from './stripPathPrefix'
var getRootPath = require('./getRootPath')

export default function (filename) {
  return stripPathPrefix(getRootPath(filename), filename)
}
