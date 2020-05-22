import { Meteor } from "meteor/meteor";

// TODO mobile replace values in settings.
// replace cordova-example native details in the settings
export const APPLE_ITUNES_APP_ID =
  Meteor.settings.public.native.appleItunesAppId;
const APPLE_TEAM_ID = Meteor.settings.public.native.appleTeamId;
const APPLE_BUNDLE_ID =
  Meteor.settings.public.native.appleBundleId;
const GOOGLE_PLAY_APP_ID =
  Meteor.settings.public.native.googlePlayAppId;
const ONE_SIGNAL_GCM_SENDER_ID = Meteor.settings.public.oneSignalGcmSenderId;
export const ONE_SIGNAL_REST_API_KEY =
  Meteor.settings.public.native.oneSignalRestApiKey;
export const ONE_SIGNAL_APP_ID =
  Meteor.settings.public.native.oneSignalAppId;

export const getGoolePlayAppUrl = ({googlePlayAppId}) => {
  if (!googlePlayAppId) {
    return null;
  }
  return `https://play.google.com/store/apps/details?id=${googlePlayAppId}`;
};

export const getAppleItunesAppUrl = ({appleItunesAppId}) => {
  if (!appleItunesAppId) {
    return null;
  }
  return `https://itunes.apple.com/app/id${appleItunesAppId}`;
};

export const getNativeStoresInfo = () => ({
  appleItunesAppId: APPLE_ITUNES_APP_ID,
  googlePlayAppId: GOOGLE_PLAY_APP_ID,
  appleTeamId: APPLE_TEAM_ID,
  appleBundleId: APPLE_BUNDLE_ID,
  oneSignalGcmSenderId: ONE_SIGNAL_GCM_SENDER_ID,
  // change to true to disable native stuff
  nativeAppEnabled: true,
});
