import getMeteorMeta from './internal/getMeteorMeta'
var getRelativePath = require('./internal/getRelativePath')

export default function (filename) {
  return getMeteorMeta(getRelativePath(filename))
}
