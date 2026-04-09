// The reload safetybelt is some js that will be loaded after everything else in
// the HTML.  In some multi-server deployments, when you update, you have a
// chance of hitting an old server for the HTML and the new server for the JS or
// CSS.  This prevents you from displaying the page in that case, and instead
// reloads it, presumably all on the new version now.
await (async () => {
  WebAppInternals.addStaticJs(await Assets.getTextAsync("safetybelt.js"));
})();
