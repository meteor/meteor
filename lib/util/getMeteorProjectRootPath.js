import path from 'path'

// must be require for rewire to work
var pathExists = require('path-exists')

export default function getMeteorProjectRootPath (currentDirectory) {

  // No folder with '.meteor/release' in it found
  if (currentDirectory === path.sep) {
    return false
  }

  const meteorPath = path.join(currentDirectory, '.meteor', 'release')
  if (pathExists.sync(meteorPath)) {
    return currentDirectory
  }

  return getMeteorProjectRootPath(path.join(currentDirectory, '..'))
}
