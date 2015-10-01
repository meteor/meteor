import path from 'path'
import invariant from 'invariant'
import ENVIRONMENT from './environment.js'
import folderNames from './folderNames.js'

function matchFirst (dirs, list) {
  for (let i = 0; i < dirs.length; i++) {
    if (list.indexOf(dirs[i]) !== -1) {
      return dirs[i]
    }
  }
  return false
}

function isCompatibilityMode (pathList) {
  var clientIndex = pathList.indexOf(folderNames.CLIENT)

  // file is directly in client-folder, so it can't be in COMPATIBILITY
  if (pathList.length - 2 === clientIndex) {
    return false
  }

  return pathList[clientIndex + 1] === folderNames.COMPATIBILITY
}

function determineEnvironment (pathList) {

  if (pathList[0] === folderNames.PUBLIC) {
    return ENVIRONMENT.PUBLIC
  }

  if (pathList[0] === folderNames.PRIVATE) {
    return ENVIRONMENT.PRIVATE
  }

  if (pathList.length > 2 && pathList[0] === folderNames.PACKAGES) {
    return ENVIRONMENT.PACKAGE
  }

  const specialFolders = [
    folderNames.CLIENT,
    folderNames.SERVER,
    folderNames.TESTS,
    folderNames.NODE_MODULES
  ]

  // remove filename
  const dirList = pathList.slice(0, -1)
  const matchedEnvironment = matchFirst(dirList, specialFolders)

  switch (matchedEnvironment) {
    case folderNames.CLIENT:
      return ENVIRONMENT.CLIENT
    case folderNames.SERVER:
      return ENVIRONMENT.SERVER
    case folderNames.TESTS:
      return ENVIRONMENT.TEST
    case folderNames.NODE_MODULES:
      return ENVIRONMENT.NODE_MODULE
    default:
      return ENVIRONMENT.UNIVERSAL
  }

}

function stripPathPrefix (parent, child) {
  const normalizedParent = path.normalize(parent)
  const normalizedChild = path.normalize(child)

  invariant(
    normalizedChild.substr(0, normalizedParent.length) === parent,
    'Linted file is not in CWD'
  )

  // also strip the / at the end, which is not in normalizedParent
  return normalizedChild.substr(normalizedParent.length + 1)
}

function getMeteorFileInfo (rootPath, filename) {
  const pathInProject = stripPathPrefix(rootPath, filename)
  const pathList = pathInProject.split(path.sep)
  const environment = determineEnvironment(pathList)

  return {
    path: pathInProject,
    env: environment,
    isCompatibilityFile: environment === ENVIRONMENT.CLIENT && isCompatibilityMode(pathList),
    isInMeteorProject: true
  }
}

function hasFile (parent, filename) {
  return filename.substr(0, parent.length) === parent
}

export default function getMeteorMeta (rootPaths, filename) {

  if (!Array.isArray(rootPaths)) {
    if (typeof rootPaths === 'object') {

      // rule is in test-mode. return the given environment
      return rootPaths
    }

    throw new Error('rootPath must be an Array') // or object for test-mode
  }


  const rootPath = rootPaths.find(function (currentPath) {
    return hasFile(currentPath, filename)
  })

  if (!rootPath) {

    // not in a Meteor Project
    return {isInMeteorProject: false}
  }

  return getMeteorFileInfo(rootPath, filename)
}
