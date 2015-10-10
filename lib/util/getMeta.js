import getMeteorMeta from './internal/getMeteorMeta'
const getRelativePath = require('./internal/getRelativePath')

export default function (filename) {
  return getMeteorMeta(getRelativePath(filename))
}
