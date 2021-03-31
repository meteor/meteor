Meteor.startup(function () {
  const bpc = Package["browser-policy-content"];
  const BP = bpc && bpc.BrowserPolicy;
  const BPc = BP && BP.content;
  if (BPc) {
    // The ability to evaluate new code is essential for loading dynamic
    // modules. Without eval, we would be forced to load modules using
    // <script src=...> tags, and then there would be no way to save those
    // modules to a local cache (or load them from the cache) without the
    // unique response caching abilities of service workers, which are not
    // available in all browsers, and cannot be polyfilled in a way that
    // satisfies Content Security Policy eval restrictions. Moreover, eval
    // allows us to evaluate dynamic module code in the original package
    // scope, which would never be possible using <script> tags. If you're
    // deploying an app in an environment that demands a Content Security
    // Policy that forbids eval, your only option is to bundle all dynamic
    // modules in the initial bundle. Fortunately, that works perfectly
    // well; you just won't get the performance benefits of dynamic module
    // fetching.
    BPc.allowEval();
  }
});
