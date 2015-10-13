import path from 'path'
import ENVIRONMENT from '../environment'
import folderNames from '../folderNames'
import isLintedEnv from './isLintedEnv'

function matchLeft (dirs, list) {
  for (let i = 0; i < dirs.length; i++) {
    if (list.indexOf(dirs[i]) !== -1) {
      return dirs[i]
    }
  }
  return false
}

function isCompatibilityMode (pathInProjectList) {
  const clientIndex = pathInProjectList.indexOf(folderNames.CLIENT)

  // file is directly in client-folder, so it can't be in COMPATIBILITY
  if (pathInProjectList.length - 2 === clientIndex) {
    return false
  }

  return pathInProjectList[clientIndex + 1] === folderNames.COMPATIBILITY
}

function isMobileConfig (pathInProjectList) {
  return pathInProjectList.length === 1 && pathInProjectList[0] === 'mobile-config.js'
}

function isPackageConfig (pathInProjectList) {
  if (pathInProjectList.length !== 3) {
    return false
  }

  return pathInProjectList[0] === folderNames.PACKAGES && pathInProjectList[2] === 'package.js'
}


function determineEnvironment (pathInProjectList) {

  if (pathInProjectList[0] === folderNames.PUBLIC) {
    return ENVIRONMENT.PUBLIC
  }

  if (pathInProjectList[0] === folderNames.PRIVATE) {
    return ENVIRONMENT.PRIVATE
  }

  if (isMobileConfig(pathInProjectList)) {
    return ENVIRONMENT.MOBILE_CONFIG
  }

  if (isPackageConfig(pathInProjectList)) {
    return ENVIRONMENT.PACKAGE_CONFIG
  }

  if (pathInProjectList.length > 2 && pathInProjectList[0] === folderNames.PACKAGES) {
    return ENVIRONMENT.PACKAGE
  }

  const specialFolders = [
    folderNames.CLIENT,
    folderNames.SERVER,
    folderNames.TESTS,
    folderNames.NODE_MODULES
  ]

  // remove filename
  const dirList = pathInProjectList.slice(0, -1)
  const matchedEnvironment = matchLeft(dirList, specialFolders)

  switch (matchedEnvironment) {
    case folderNames.CLIENT:
      return isCompatibilityMode(pathInProjectList) ? ENVIRONMENT.COMPATIBILITY : ENVIRONMENT.CLIENT
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

function getMeteorFileInfo (relativeFilename) {
  const pathInProjectList = relativeFilename.split(path.sep)
  const environment = determineEnvironment(pathInProjectList)

  return {
    path: relativeFilename,
    env: environment,
    isLintedEnv: isLintedEnv(environment)
  }
}

export default function getMeteorMeta (relativeFilename) {

  if (!relativeFilename) {

    // not in a Meteor Project
    return {env: ENVIRONMENT.NON_METEOR}
  }

  return getMeteorFileInfo(relativeFilename)
}
