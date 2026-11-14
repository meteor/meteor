import { Meteor } from 'meteor/meteor';
import { detectIsCapacitorRuntime, detectCapacitorClientArch } from 'meteor/capacitor';
import { WebAppInternals } from 'meteor/webapp';
import { defineConfig } from '@meteorjs/capacitor';

const native: boolean = detectIsCapacitorRuntime();
const runtimeFlag: boolean = Meteor.isCapacitor;
// @ts-expect-error Also rejects a missing augmentation silently resolved as any.
const invalidFlag: string = Meteor.isCapacitor;

const previous = WebAppInternals.registerClientArchDetector('capacitor', detectCapacitorClientArch);
WebAppInternals.registerClientArchDetector('capacitor', previous);
WebAppInternals.registerClientArchDetector('typed-app', (_request, categorized) => {
  const browserMajor: number = categorized.browser.major;
  return { arch: 'web.cordova', path: categorized.path };
});
// @ts-expect-error An architecture detector must return a supported result shape.
WebAppInternals.registerClientArchDetector('invalid', () => ({ arch: 42 }));

defineConfig(context => ({
  appId: 'com.meteor.types',
  appName: context.isDevelopment ? 'Development' : 'Production',
}));
