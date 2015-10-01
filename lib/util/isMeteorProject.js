import path from 'path'
import pathExists from 'path-exists'

export default function isMeteorProject (currentDirectory) {
  const meteorPath = path.join(currentDirectory, '.meteor', 'release')
  return pathExists.sync(meteorPath)
}
