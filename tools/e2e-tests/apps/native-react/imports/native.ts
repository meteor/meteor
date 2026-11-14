import { Meteor } from 'meteor/meteor';

export function nativeRuntimeLabel(): string {
  return Meteor.isCapacitor ? 'Capacitor' : 'Web';
}
