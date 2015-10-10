import path from 'path'
const pathExists = require('path-exists')

export default function isMeteorProject (currentDirectory) {
  const meteorPath = path.join(currentDirectory, '.meteor', 'release')
  return pathExists.sync(meteorPath)
}
