import {difference} from './sets'

export default function invert (executors) {
  return difference(new Set(['browser', 'server', 'cordova']), executors)
}
