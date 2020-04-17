// If autoupdate is installed, modifying Meteor.settings.public will cause
// the hashes in Autoupdate.versions to be computed differently, which
// will trigger a reload in the browser, which is what we want when
// running test-packages in the browser, since reloading the window is
// what kicks off both server and client tests again.
Meteor.settings.public.autoupdateSalt = Random.id();
