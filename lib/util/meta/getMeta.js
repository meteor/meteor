import getMeteorMeta from './getMeteorMeta'
const getRelativePath = require('./getRelativePath')

export default function (filename) {
  return getMeteorMeta(getRelativePath(filename))
}
