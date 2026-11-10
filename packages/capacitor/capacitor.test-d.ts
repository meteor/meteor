import { expectTypeOf } from "expect-type";
import { Meteor } from "meteor/meteor";
import { WebAppInternals } from "meteor/webapp";
import {
  detectIsCapacitorRuntime,
  isCapacitorDirectServerMode,
  getCapacitorLivereloadUserAgentToken,
  isCapacitorLivereloadRequest,
  detectCapacitorClientArch,
  getCordovaJsStub,
  injectWebAppLocalServerShim,
} from "./capacitor";

expectTypeOf(Meteor.isCapacitor).toBeBoolean();
expectTypeOf(detectIsCapacitorRuntime).returns.toBeBoolean();
expectTypeOf(detectIsCapacitorRuntime({
  Capacitor: { isNativePlatform: () => true },
})).toBeBoolean();
expectTypeOf(isCapacitorDirectServerMode).returns.toBeBoolean();
expectTypeOf(getCapacitorLivereloadUserAgentToken).returns.toBeString();
expectTypeOf(isCapacitorLivereloadRequest).returns.toBeBoolean();
expectTypeOf(detectCapacitorClientArch).returns.toEqualTypeOf<"web.cordova" | null>();
expectTypeOf(getCordovaJsStub).returns.toEqualTypeOf<string | null>();
expectTypeOf(injectWebAppLocalServerShim).returns.toBeBoolean();

// Capacitor's server helpers must remain usable as typed WebApp hooks.
WebAppInternals.registerClientArchDetector("capacitor", detectCapacitorClientArch);
WebAppInternals.registerBoilerplateDataCallback("capacitor", injectWebAppLocalServerShim);

// @ts-expect-error The runtime flag is boolean, not an arbitrary configuration value.
Meteor.isCapacitor = "true";
// @ts-expect-error Environment variables are strings.
isCapacitorDirectServerMode({ METEOR_CAPACITOR: true });
