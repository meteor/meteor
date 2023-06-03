// For our testing purpose, we don't want the cache manifest to be
// active, all we want is the cache manifest to be manually request-able
// so we can read it and verify its validity from the client.  This is
// because caching the test files would make tests non deterministic
// depending on the state of the browser cache.  To do that we disable
// the "manifest" attribute of the <html> tag. This runs after appcache
// registers its hook, so this hook overrides the return value of the
// real hook. We point to a non-existent file to clear the appcache in
// case there was previously a site running with appcache on
// localhost:3000.
WebApp.addHtmlAttributeHook(request => ({ manifest: "/no-such-file" }));


// Let's add some resources in the 'NETWORK' section
Meteor.AppCache.config({
  onlineOnly: [
    '/online/',
    '/bigimage.jpg',
    '/largedata.json'
  ],
  _disableSizeCheck: true // don't print warnings
});
