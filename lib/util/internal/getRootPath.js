import find from 'lodash.find'
import isMeteorProject from './isMeteorProject'
const findOneUpwards = require('./findOneUpwards')

function hasFile (parent, filename) {
  return filename.substr(0, parent.length) === parent
}

// cache for root paths
const rootPaths = []

export default function (filename) {

  // check whether the project root is already known or not
  let rootPath = find(rootPaths, function (currentPath) {
    return hasFile(currentPath, filename)
  })

  if (!rootPath) {

    // project root is unkown. search for it
    rootPath = findOneUpwards(filename, isMeteorProject)
    rootPaths.push(rootPath)
  }

  return rootPath
}
