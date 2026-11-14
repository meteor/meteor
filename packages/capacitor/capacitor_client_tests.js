import { Tinytest } from 'meteor/tinytest';
import { Meteor } from 'meteor/meteor';

import { detectIsCapacitorRuntime } from './capacitor_client.js';

Tinytest.add('capacitor - runtime flag - browser client stays false', test => {
  test.isFalse(Meteor.isCordova);
  test.isFalse(Meteor.isCapacitor);
});

Tinytest.add('capacitor - runtime flag - detector requires cordova and native platform', test => {
  const originalIsCordova = Meteor.isCordova;

  try {
    Meteor.isCordova = false;
    test.isFalse(detectIsCapacitorRuntime({
      Capacitor: {
        isNativePlatform() {
          return true;
        },
      },
    }));

    Meteor.isCordova = true;
    test.isFalse(detectIsCapacitorRuntime({}));
    test.isFalse(detectIsCapacitorRuntime({
      Capacitor: {},
    }));
    test.isFalse(detectIsCapacitorRuntime({
      Capacitor: {
        isNativePlatform() {
          return false;
        },
      },
    }));
    test.isTrue(detectIsCapacitorRuntime({
      Capacitor: {
        isNativePlatform() {
          return true;
        },
      },
    }));
  } finally {
    Meteor.isCordova = originalIsCordova;
  }
});
