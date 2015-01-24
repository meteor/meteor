if (Meteor.isServer) {
  Meteor.AppCache.config({
    // Turn off appcache on Safari. Apparently Safari 7's AppCache is totally
    // busted. In particular, this fact combined with our "RELOAD_SAFETYBELT"
    // strategy causes infinite reloads in Safari at times.
    //
    // See http://stackoverflow.com/questions/22888945/safari-7-application-cache-does-not-work
    safari: false,
    // ... and Firefox too.  See eg https://github.com/meteor/meteor/issues/3248
    firefox: false
  });
}
